// --- CONFIGURAÇÃO DO FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyCxoCC0gy65F5Sc5AR4V6nkpAF5m54OTj0",
  authDomain: "honda-app-web.firebaseapp.com",
  projectId: "honda-app-web",
  storageBucket: "honda-app-web.firebasestorage.app",
  messagingSenderId: "358491652828",
  appId: "1:358491652828:web:732d1ab734b4b8844aaa19"
};

// Inicializa o Firebase e o banco Firestore
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

const { createApp } = Vue;

createApp({
  data() {
    return {
      etapa: 1,
      leadId: null,
      consultorRef: '',
      consultorAtual: null,
      modoPainelVendedor: true, // 🚀 Controla se a página exibe a vitrine do SaaS ou o Simulador do Lead
      telaPainel: 'home',
      exibirModalTermos: false,
      estados: [],
      cidades: [],
      carregandoCidades: false,
      lead: {
        nome: '',
        whatsapp: '',
        uf: 'AL',
        cidade: '',
        orcamento: 500,
        lanceAproximado: 0,
        aceitouTermos: false
      },
      catalogoMotos: [],
      carregandoCatalogo: true,
      erroCatalogo: false,
      motoSelecionada: null,
      planoSelecionado: null
    };
  },
  computed: {
    progressoBarra() {
      if (this.etapa === 2) return '0%';
      if (this.etapa === 3) return '50%';
      if (this.etapa === 4) return '100%';
      return '0%';
    },
    motosFiltradas() {
      if (!this.catalogoMotos.length) return [];
      let resultado = [];

      this.catalogoMotos.forEach(moto => {
        if (!moto.planos || !moto.planos.length) return;
        const planosValidos = moto.planos.filter(p => p.valor <= this.lead.orcamento);
        if (planosValidos.length > 0) {
          const melhorPlano = planosValidos.reduce((prev, curr) => 
            (prev.parcelas > curr.parcelas) ? prev : curr
          );
          resultado.push({ moto: moto, plano: melhorPlano });
        }
      });

      return resultado.sort((a, b) => b.plano.valor - a.plano.valor);
    }
  },
  methods: {
    // Redireciona para a tela de criação de conta no Admin
    irParaCadastro() {
      window.location.href = './admin/index.html#criar';
    },

    // Redireciona para o painel de login/admin
    irParaLogin() {
      window.location.href = './admin/index.html';
    }, // 👈 VÍRGULA ADICIONADA AQUI COM SUCESSO

    // 🔍 Identifica o consultor dono do link via query string (?ref=slug ou ?v=slug)
    async verificarConsultorRef() {
      // Pega a URL completa para inspecionar parâmetros com segurança
      const urlParams = new URLSearchParams(window.location.search);
      const ref = urlParams.get('ref') || urlParams.get('v');

      // 🔥 CORREÇÃO EXTRA PARA O GITHUB PAGES: Verifica se há parâmetros na hash
      let slugFinal = ref;
      if (!slugFinal && window.location.hash.includes('?')) {
        const hashQuery = new URLSearchParams(window.location.hash.split('?')[1]);
        slugFinal = hashQuery.get('ref') || hashQuery.get('v');
      }

      if (slugFinal) {
        this.consultorRef = slugFinal;
        this.modoPainelVendedor = false; // Entra na tela do Lead (Simulador)
        try {
          const snapshot = await db.collection('consultores').where('slug', '==', slugFinal).limit(1).get();
          
          if (!snapshot.empty) {
            this.consultorAtual = snapshot.docs[0].data();
          } else {
            const docCpf = await db.collection('consultores').doc(slugFinal.replace(/\D/g, '')).get();
            if (docCpf.exists) {
              this.consultorAtual = docCpf.data();
            }
          }
        } catch (e) {
          console.error("Erro ao buscar consultor dono do link:", e);
        }
      } else {
        // 🚀 Se a URL estiver limpa, ativa o Painel do Vendedor
        this.modoPainelVendedor = true;
      }
    },

    voltarEtapa() {
      if (this.etapa > 1) this.etapa--;
    },

    limitarWhatsapp(event) {
      const apenasNumeros = event.target.value.replace(/\D/g, '');
      this.lead.whatsapp = apenasNumeros.slice(0, 11);
    },

    async carregarEstados() {
      try {
        const res = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome');
        const data = await res.json();
        this.estados = data.map(e => ({ sigla: e.sigla, nome: e.nome }));
        this.carregarCidades();
      } catch (err) {
        console.error("Erro ao carregar estados do IBGE:", err);
      }
    },

    async carregarCidades() {
      if (!this.lead.uf) return;
      this.carregandoCidades = true;
      this.cidades = [];

      try {
        const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${this.lead.uf}/municipios?orderBy=nome`);
        this.cidades = await res.json();
      } catch (err) {
        console.error("Erro ao carregar cidades do IBGE:", err);
      } finally {
        this.carregandoCidades = false;
      }
    },

    // TELA 1: Salva o lead no Firestore
    async avancarEtapa1() {
      if (!this.lead.nome || !this.lead.whatsapp || !this.lead.uf || !this.lead.cidade || !this.lead.aceitouTermos) return;

      const consultorIdPadrao = this.consultorAtual 
        ? (this.consultorAtual.slug || this.consultorAtual.cpf) 
        : (this.consultorRef || 'PADRAO');

      try {
        const docRef = await db.collection("leads").add({
          consultorCpf: consultorIdPadrao,
          nome: this.lead.nome,
          whatsapp: this.lead.whatsapp,
          uf: this.lead.uf,
          cidade: this.lead.cidade,
          aceitouTermos: true,
          termoVersao: "v1.0 - 2026",
          dataConsentimento: firebase.firestore.FieldValue.serverTimestamp(),
          etapaAlcancada: 1,
          dataCriacao: firebase.firestore.FieldValue.serverTimestamp(),
          atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
        });

        this.leadId = docRef.id;
      } catch (error) {
        console.error("Erro ao salvar lead no Firebase:", error);
      }

      this.etapa = 2;
    },

    // TELA 2: Atualiza o orçamento
    async avancarEtapa2() {
      if (this.leadId) {
        try {
          await db.collection("leads").doc(this.leadId).update({
            orcamento: this.lead.orcamento,
            etapaAlcancada: 2,
            atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
          });
        } catch (error) {
          console.error("Erro ao atualizar orçamento:", error);
        }
      }
      this.etapa = 3;
    },

    // TELA 3 -> 4: Registra a moto, o plano e o lance simulado
    async selecionarMoto(moto, plano) {
      this.motoSelecionada = moto;
      this.planoSelecionado = plano;

      if (this.leadId) {
        try {
          await db.collection("leads").doc(this.leadId).update({
            motoInteresse: moto.modelo,
            planoMeses: plano.parcelas,
            planoSelecionado: {
              parcelas: plano.parcelas,
              valor: plano.valor
            },
            lanceAproximado: this.lead.lanceAproximado || 0,
            etapaAlcancada: 4,
            atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
          });
        } catch (error) {
          console.error("Erro ao registrar a escolha da moto:", error);
        }
      }

      this.etapa = 4;
    },

    formatarMoeda(valor) {
      if (typeof valor !== 'number') return '0,00';
      return valor.toFixed(2).replace('.', ',');
    },

    // 📲 Direciona o WhatsApp para o consultor incluindo o dossiê de lance
    abrirWhatsApp() {
      const numDestino = this.consultorAtual && this.consultorAtual.whatsapp
        ? this.consultorAtual.whatsapp.replace(/\D/g, '')
        : '82999679667';

      const nomeConsultor = this.consultorAtual ? this.consultorAtual.nome : 'Pedro';
      const nomeClient = this.lead.nome || "Cliente";
      const moto = this.motoSelecionada ? this.motoSelecionada.modelo : '';
      const parcelas = this.planoSelecionado ? this.planoSelecionado.parcelas : 0;
      const valor = this.planoSelecionado ? this.formatarMoeda(this.planoSelecionado.valor) : '0,00';
      const lanceTexto = this.lead.lanceAproximado > 0 ? ` e pretendo dar um lance de aprox. *R$ ${this.formatarMoeda(this.lead.lanceAproximado)}*` : '';

      const mensagem = `Olá, ${nomeConsultor}! Me chamo *${nomeClient}*. Fiz uma simulação no Zappmotos para a *${moto}* com parcelas de *R$ ${valor}* em *${parcelas}x*${lanceTexto}. Sou de ${this.lead.cidade}/${this.lead.uf}. Como faço para contratar?`;

      const url = `https://wa.me/55${numDestino}?text=${encodeURIComponent(mensagem)}`;
      window.open(url, '_blank');
    }
  },
  async mounted() {
    await this.verificarConsultorRef();
    this.carregarEstados();

    if (!this.modoPainelVendedor) {
      fetch('motos.json')
        .then(response => {
          if (!response.ok) throw new Error(`Erro de rede ao carregar JSON: ${response.status}`);
          return response.json();
        })
        .then(data => {
          this.catalogoMotos = data.catalogo_honda;
          this.carregandoCatalogo = false;
        })
        .catch(error => {
          console.error("Erro ao carregar motos.json:", error);
          this.carregandoCatalogo = false;
          this.erroCatalogo = true;
        });
    }
  }
}).mount('#app');