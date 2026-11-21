// --- CONFIGURAÇÃO DO FIREBASE ---
const firebaseConfig = {
  apiKey: "AIzaSyCxoCC0gy65F5Sc5AR4V6nkpAF5m54OTj0",
  authDomain: "honda-app-web.firebaseapp.com",
  projectId: "honda-app-web",
  storageBucket: "honda-app-web.firebasestorage.app",
  messagingSenderId: "358491652828",
  appId: "1:358491652828:web:732d1ab734b4b8844aaa19"
};

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
      modoPainelVendedor: true,
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
    marcaAtiva() {
      if (this.consultorAtual && this.consultorAtual.marca) {
        return String(this.consultorAtual.marca).trim().toUpperCase();
      }
      if (this.consultorAtual && this.consultorAtual.codigoAcesso && String(this.consultorAtual.codigoAcesso).includes('-')) {
        return String(this.consultorAtual.codigoAcesso).split('-')[0].trim().toUpperCase();
      }
      return 'Honda';
    },
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
        const planosValidos = moto.planos.filter(p => p.parcela <= this.lead.orcamento);
        if (planosValidos.length > 0) {
          const melhorPlano = planosValidos.reduce((prev, curr) => 
            (prev.meses > curr.meses) ? prev : curr
          );
          resultado.push({ moto: moto, plano: melhorPlano });
        }
      });

      return resultado.sort((a, b) => b.plano.parcela - a.plano.parcela);
    },

    analiseLance() {
      if (!this.planoSelecionado || !this.lead.lanceAproximado || this.lead.lanceAproximado <= 0) {
        return { 
          valorBem: this.planoSelecionado ? (this.planoSelecionado.parcela * this.planoSelecionado.meses) : 0, 
          percentual: 0, 
          texto: 'Informe um valor para analisar suas chances', 
          classe: 'text-muted', 
          badgeBg: 'bg-light text-dark' 
        };
      }

      const valorBem = this.planoSelecionado.parcela * this.planoSelecionado.meses;
      const percentual = (this.lead.lanceAproximado / valorBem) * 100;

      let resultado = {
        valorBem: valorBem,
        percentual: percentual.toFixed(1),
        texto: '',
        classe: '',
        badgeBg: ''
      };

      if (percentual < 15) {
        resultado.texto = '⚠️ Quase ou nenhuma chance de contemplação (Abaixo do mínimo de 15%)';
        resultado.classe = 'text-danger';
        resultado.badgeBg = 'bg-danger-subtle text-danger border border-danger-subtle';
      } else if (percentual >= 15 && percentual < 20) {
        resultado.texto = '🔍 Baixa chance no lance mínimo';
        resultado.classe = 'text-warning text-dark';
        resultado.badgeBg = 'bg-warning-subtle text-dark border border-warning-subtle';
      } else if (percentual >= 20 && percentual <= 40) {
        resultado.texto = '✅ Boa chance de contemplação';
        resultado.classe = 'text-success';
        resultado.badgeBg = 'bg-success-subtle text-success border border-success-subtle';
      } else if (percentual > 40 && percentual < 50) {
        resultado.texto = '🔥 Média chance de contemplação';
        resultado.classe = 'text-primary';
        resultado.badgeBg = 'bg-primary-subtle text-primary border border-primary-subtle';
      } else {
        resultado.texto = '🚀 Alta chance de contemplação!';
        resultado.classe = 'text-success fw-bold';
        resultado.badgeBg = 'bg-success text-white';
      }

      return resultado;
    }
  },
  methods: {
    irParaCadastro() {
      window.location.href = './admin/index.html#criar';
    },

    irParaLogin() {
      window.location.href = './admin/index.html';
    },

    normalizarMotoDoc(doc) {
      const dados = doc.data();
      const planosNormalizados = (dados.planos || []).map(p => {
        const qtdMeses = Number(p.meses || p.parcelas || 0);
        const valorParcela = Number(p.parcela || p.valor || 0);
        return {
          meses: qtdMeses,
          parcelas: qtdMeses,
          parcela: valorParcela,
          valor: valorParcela
        };
      });

      return {
        id: doc.id,
        ...dados,
        planos: planosNormalizados
      };
    },

    async verificarConsultorRef() {
      const urlParams = new URLSearchParams(window.location.search);
      const ref = urlParams.get('ref') || urlParams.get('v');

      let slugFinal = ref;
      if (!slugFinal && window.location.hash.includes('?')) {
        const hashQuery = new URLSearchParams(window.location.hash.split('?')[1]);
        slugFinal = hashQuery.get('ref') || hashQuery.get('v');
      }

      if (slugFinal) {
        this.consultorRef = slugFinal;
        this.modoPainelVendedor = false;
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

          await this.carregarCatalogoFirestore(this.consultorAtual);

        } catch (e) {
          console.error("Erro ao buscar consultor dono do link:", e);
          this.carregandoCatalogo = false;
          this.erroCatalogo = true;
        }
      } else {
        this.modoPainelVendedor = true;
        this.carregandoCatalogo = false;
      }
    },

    // 🏍️ Carrega planos filtrando pela marca do consultor ou vínculo corporativo
    async carregarCatalogoFirestore(consultor) {
      try {
        const snapAtivos = await db.collection('planos_consorcio').where('ativo', '==', true).get();
        let listaDocs = snapAtivos.docs.map(doc => this.normalizarMotoDoc(doc));

        if (consultor) {
          const marcaAlvo = (
            consultor.marca ||
            (consultor.codigoAcesso && String(consultor.codigoAcesso).includes('-')
              ? String(consultor.codigoAcesso).split('-')[0]
              : '')
          ).trim().toUpperCase();

          const concId = String(consultor.concessionariaId || '').trim();
          const codAcesso = String(consultor.codigoAcesso || '').trim().toUpperCase();

          const filtrados = listaDocs.filter(m => {
            const motoMarca = String(m.marca || (m.codigoAcesso && String(m.codigoAcesso).includes('-') ? String(m.codigoAcesso).split('-')[0] : '')).trim().toUpperCase();
            const bateMarca = marcaAlvo && motoMarca === marcaAlvo;
            const bateConc = concId && String(m.concessionariaId || '').trim() === concId;
            const bateCodigo = codAcesso && String(m.codigoAcesso || '').trim().toUpperCase() === codAcesso;
            return bateMarca || bateConc || bateCodigo;
          });

          if (filtrados.length > 0) {
            listaDocs = filtrados;
          }
        }

        this.catalogoMotos = listaDocs;
        this.carregandoCatalogo = false;
      } catch (e) {
        console.error("Erro ao carregar catálogo do Firestore:", e);
        this.carregandoCatalogo = false;
        this.erroCatalogo = true;
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

    async avancarEtapa1() {
      if (!this.lead.nome || !this.lead.whatsapp || !this.lead.uf || !this.lead.cidade || !this.lead.aceitouTermos) return;

      const consultorIdentificador = this.consultorAtual 
        ? (this.consultorAtual.slug || this.consultorAtual.cpf) 
        : (this.consultorRef || 'PADRAO');

      const concessionariaIdLoja = this.consultorAtual 
        ? (this.consultorAtual.concessionariaId || '') 
        : '';

      try {
        const docRef = await db.collection("leads").add({
          consultorCpf: consultorIdentificador,
          consultorSlug: this.consultorAtual ? this.consultorAtual.slug : '',
          concessionariaId: concessionariaIdLoja,
          marca: this.marcaAtiva,
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

    async selecionarMoto(moto, plano) {
      this.motoSelecionada = moto;
      this.planoSelecionado = plano;

      if (this.leadId) {
        const analise = this.analiseLance;
        try {
          await db.collection("leads").doc(this.leadId).update({
            motoInteresse: moto.modelo,
            planoMeses: plano.meses,
            planoSelecionado: {
              parcelas: plano.meses,
              valor: plano.parcela
            },
            valorTotalBem: plano.parcela * plano.meses,
            lanceAproximado: this.lead.lanceAproximado || 0,
            percentualLance: Number(analise.percentual) || 0,
            chanceContemplacao: analise.texto,
            etapaAlcancada: 4,
            atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
          });
        } catch (error) {
          console.error("Erro ao registrar a escolha da moto:", error);
        }
      }

      this.etapa = 4;
    },

    async salvarLanceFirestore() {
      if (this.leadId && this.planoSelecionado) {
        const analise = this.analiseLance;
        try {
          await db.collection("leads").doc(this.leadId).update({
            lanceAproximado: this.lead.lanceAproximado || 0,
            percentualLance: Number(analise.percentual) || 0,
            chanceContemplacao: analise.texto,
            valorTotalBem: analise.valorBem,
            atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
          });
        } catch (error) {
          console.error("Erro ao atualizar lance no Firebase:", error);
        }
      }
    },

    formatarMoeda(valor) {
      if (typeof valor !== 'number') return '0,00';
      return valor.toFixed(2).replace('.', ',');
    },

    async abrirWhatsApp() {
      await this.salvarLanceFirestore();

      const numDestino = this.consultorAtual && this.consultorAtual.whatsapp
        ? this.consultorAtual.whatsapp.replace(/\D/g, '')
        : '82999679667';

      const nomeConsultor = this.consultorAtual ? this.consultorAtual.nome : 'Pedro';
      const nomeClient = this.lead.nome || "Cliente";
      const moto = this.motoSelecionada ? this.motoSelecionada.modelo : '';
      const parcelas = this.planoSelecionado ? this.planoSelecionado.meses : 0;
      const valor = this.planoSelecionado ? this.formatarMoeda(this.planoSelecionado.parcela) : '0,00';
      
      const analise = this.analiseLance;
      const lanceTexto = this.lead.lanceAproximado > 0 
        ? ` e pretendo dar um lance de aprox. *R$ ${this.formatarMoeda(this.lead.lanceAproximado)}* (~${analise.percentual}% do bem - ${analise.texto})` 
        : '';

      const mensagem = `Olá, ${nomeConsultor}! Me chamo *${nomeClient}*. Fiz uma simulação no Zappmotos para a *${moto}* (${this.marcaAtiva}) com parcelas de *R$ ${valor}* em *${parcelas}x*${lanceTexto}. Sou de ${this.lead.cidade}/${this.lead.uf}. Como faço para contratar?`;

      const url = `https://wa.me/55${numDestino}?text=${encodeURIComponent(mensagem)}`;
      window.open(url, '_blank');
    }
  },
  async mounted() {
    await this.verificarConsultorRef();
    this.carregarEstados();
  }
}).mount('#app');