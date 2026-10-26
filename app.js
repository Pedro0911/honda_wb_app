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
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const { createApp } = Vue;

createApp({
  data() {
    return {
      etapa: 1,
      leadId: null,
      exibirModalTermos: false,
      estados: [],
      cidades: [],
      carregandoCidades: false,
      lead: {
        nome: '',
        whatsapp: '',
        uf: 'AL', // Pré-seleciona Alagoas por padrão
        cidade: '',
        orcamento: 500,
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
    voltarEtapa() {
      if (this.etapa > 1) this.etapa--;
    },

    // Limita o WhatsApp apenas a números e a 11 dígitos (Padrão Brasil: DDD + 9 dígitos)
    limitarWhatsapp(event) {
      const apenasNumeros = event.target.value.replace(/\D/g, '');
      this.lead.whatsapp = apenasNumeros.slice(0, 11);
    },

    // Busca todos os estados do Brasil via API do IBGE
    async carregarEstados() {
      try {
        const res = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome');
        const data = await res.json();
        this.estados = data.map(e => ({ sigla: e.sigla, nome: e.nome }));
        // Carrega automaticamente as cidades do estado inicial (AL)
        this.carregarCidades();
      } catch (err) {
        console.error("Erro ao carregar estados do IBGE:", err);
      }
    },

    // Busca as cidades do estado selecionado via API do IBGE
    async carregarCidades() {
      if (!this.lead.uf) return;
      this.carregandoCidades = true;
      this.cidades = [];
      this.lead.cidade = ''; // Reseta a cidade ao trocar de estado

      try {
        const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${this.lead.uf}/municipios?orderBy=nome`);
        this.cidades = await res.json();
      } catch (err) {
        console.error("Erro ao carregar cidades do IBGE:", err);
      } finally {
        this.carregandoCidades = false;
      }
    },

    // TELA 1: Salva o novo lead no Firestore com UF, Cidade e Consentimento LGPD
    async avancarEtapa1() {
      if (!this.lead.nome || !this.lead.whatsapp || !this.lead.uf || !this.lead.cidade || !this.lead.aceitouTermos) return;

      try {
        const docRef = await db.collection("leads").add({
          nome: this.lead.nome,
          whatsapp: this.lead.whatsapp,
          uf: this.lead.uf,
          cidade: `${this.lead.cidade} - ${this.lead.uf}`,
          aceitouTermos: true,
          termoVersao: "v1.0 - 2026",
          dataConsentimento: firebase.firestore.FieldValue.serverTimestamp(),
          etapaAlcancada: 1,
          criadoEm: firebase.firestore.FieldValue.serverTimestamp()
        });

        this.leadId = docRef.id;
        console.log("Lead registrado com sucesso! ID:", this.leadId);
      } catch (error) {
        console.error("Erro ao salvar lead no Firebase:", error);
      }

      this.etapa = 2;
    },

    // TELA 2: Atualiza o orçamento no documento do lead existente
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

    // TELA 3 -> 4: Registra a moto e o plano em que o cliente clicou
    async selecionarMoto(moto, plano) {
      this.motoSelecionada = moto;
      this.planoSelecionado = plano;

      if (this.leadId) {
        try {
          await db.collection("leads").doc(this.leadId).update({
            motoSelecionada: moto.modelo,
            planoSelecionado: {
              parcelas: plano.parcelas,
              valor: plano.valor
            },
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

    abrirWhatsApp() {
      const telefone = "5582999679667";
      const nome = this.lead.nome || "Cliente";
      const moto = this.motoSelecionada.modelo;
      const parcelas = this.planoSelecionado.parcelas;
      const valor = this.formatarMoeda(this.planoSelecionado.valor);

      const mensagem = `Olá, Pedro! Me chamo *${nome}*. Fiz uma simulação no site para a *${moto}* com parcelas de *R$ ${valor}* em *${parcelas}x*. Como faço para contratar?`;

      const url = `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`;
      window.open(url, '_blank');
    }
  },
  mounted() {
    // Carrega a lista de estados e cidades do IBGE
    this.carregarEstados();

    // Carrega o catálogo de motos
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
}).mount('#app');