// --- CONFIGURAÇÃO DO FIREBASE (ADMIN) ---
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
      abaAuth: 'login', // 'login' ou 'cadastro'
      abaAtual: 'leads', // 'leads', 'link', 'perfil'
      consultorLogado: null,
      carregandoAuth: false,
      carregando: false,
      salvandoPerfil: false,
      copiado: false,

      // Form Login
      formLogin: { cpf: '', senha: '' },

      // Form Cadastro (#1)
      formCadastro: { nome: '', cpf: '', empresaHonda: '', whatsapp: '', senha: '' },

      // Form Perfil (#2)
      formPerfil: { nome: '', empresaHonda: '', whatsapp: '', novaSenha: '' },

      // Leads e Filtros
      leads: [],
      filtroBusca: '',
      filtroMoto: '',
      filtroEtapa: ''
    };
  },
  computed: {
    leadsFiltrados() {
      return this.leads.filter(lead => {
        const busca = this.filtroBusca.toLowerCase();
        const bateNome = (lead.nome || '').toLowerCase().includes(busca);
        const bateZap = (lead.whatsapp || '').includes(busca);
        const bateCidade = (lead.cidade || '').toLowerCase().includes(busca);

        const bateMoto = !this.filtroMoto || lead.motoInteresse === this.filtroMoto;
        const bateEtapa = !this.filtroEtapa || String(lead.etapaAlcancada || 1) === String(this.filtroEtapa);

        return (bateNome || bateZap || bateCidade) && bateMoto && bateEtapa;
      });
    },
    totalLeadsHoje() {
      const hoje = new Date().toDateString();
      return this.leads.filter(l => {
        if (!l.dataCriacao) return false;
        const data = l.dataCriacao.toDate ? l.dataCriacao.toDate() : new Date(l.dataCriacao);
        return data.toDateString() === hoje;
      }).length;
    },
    motoMaisClicada() {
      if (!this.leads.length) return 'Nenhuma';
      const contagem = {};
      this.leads.forEach(l => {
        if (l.motoInteresse) {
          contagem[l.motoInteresse] = (contagem[l.motoInteresse] || 0) + 1;
        }
      });
      const ord = Object.entries(contagem).sort((a,b) => b[1] - a[1]);
      return ord.length ? `${ord[0][0]} (${ord[0][1]})` : 'Pop/CG 160';
    },
    listaMotosUnicas() {
      return Array.from(new Set(this.leads.map(l => l.motoInteresse).filter(Boolean)));
    }
  },
  methods: {
    mascararCpf(formName) {
      let v = this[formName].cpf.replace(/\D/g, '');
      if (v.length > 11) v = v.slice(0, 11);
      v = v.replace(/(\d{3})(\d)/, '$1.$2');
      v = v.replace(/(\d{3})(\d)/, '$1.$2');
      v = v.replace(/(\d{3})(\d{1,2})$/, '$1-$2');
      this[formName].cpf = v;
    },
    limitarWhatsapp() {
      this.formCadastro.whatsapp = this.formCadastro.whatsapp.replace(/\D/g, '').slice(0, 11);
    },
    limparCpf(cpf) {
      return (cpf || '').replace(/\D/g, '');
    },

   // 🔑 CADASTRO DE CONSULTOR (Com Slug Seguro para ocultar o CPF na URL)
    async cadastrarConsultor() {
      const cpfLimpo = this.limparCpf(this.formCadastro.cpf);
      if (cpfLimpo.length !== 11) {
        alert("Por favor, digite um CPF válido com 11 dígitos.");
        return;
      }
      this.carregandoAuth = true;

      try {
        const docRef = db.collection('consultores').doc(cpfLimpo);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
          alert("Este CPF já está cadastrado no Zappmotos. Faça login!");
          this.abaAuth = 'login';
          return;
        }

        // Cria um slug/código seguro e limpo para usar na URL
        const nomeBruto = this.formCadastro.nome || 'consultor';
        const primeiroNome = nomeBruto.trim().split(' ')[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const randomId = Math.random().toString(36).substring(2, 7);
        const slugSeguro = `${primeiroNome}-${randomId}`;

        const dadosConsultor = {
          cpf: cpfLimpo,
          slug: slugSeguro, // <- O identificador público seguro
          nome: this.formCadastro.nome,
          empresaHonda: this.formCadastro.empresaHonda,
          whatsapp: this.formCadastro.whatsapp.replace(/\D/g, ''),
          senha: this.formCadastro.senha,
          dataCriacao: firebase.firestore.FieldValue.serverTimestamp()
        };

        await docRef.set(dadosConsultor);
        this.entrarSessao(dadosConsultor);
      } catch (e) {
        console.error("Erro ao cadastrar consultor:", e);
        alert("Erro ao realizar cadastro: " + e.message);
      } finally {
        this.carregandoAuth = false;
      }
    },

    // 🔑 LOGIN DE CONSULTOR (#1)
    async realizarLogin() {
      const cpfLimpo = this.limparCpf(this.formLogin.cpf);
      this.carregandoAuth = true;

      try {
        const docSnap = await db.collection('consultores').doc(cpfLimpo).get();
        if (!docSnap.exists) {
          alert("CPF não cadastrado.");
          return;
        }

        const consultor = docSnap.data();
        if (consultor.senha !== this.formLogin.senha) {
          alert("Senha incorreta.");
          return;
        }

        this.entrarSessao(consultor);
      } catch (e) {
        console.error("Erro no login:", e);
        alert("Erro ao efetuar login.");
      } finally {
        this.carregandoAuth = false;
      }
    },

    entrarSessao(consultor) {
      this.consultorLogado = consultor;
      this.formPerfil.nome = consultor.nome;
      this.formPerfil.empresaHonda = consultor.empresaHonda;
      this.formPerfil.whatsapp = consultor.whatsapp;
      localStorage.setItem('zappmotos_consultor', JSON.stringify(consultor));
      this.carregarLeads();
    },
    deslogar() {
      this.consultorLogado = null;
      localStorage.removeItem('zappmotos_consultor');
    },

    // 📊 CARREGA OS LEADS DO CONSULTOR (Compatível com CPF ou Slug)
    // 📊 CARREGA TODOS OS LEADS DO CONSULTOR DE FORMA SIMPLES E SEGURA
   // 📊 CARREGA TODOS OS LEADS DA COLEÇÃO E FILTRA POR SEGURANÇA
// 📊 CARREGA TODOS OS LEADS DA COLEÇÃO E EXIBE NO PAINEL
    async carregarLeads() {
      if (!this.consultorLogado) return;
      this.carregando = true;
      try {
        const cpfLogado = (this.consultorLogado.cpf || '').replace(/\D/g, '');
        const slugLogado = this.consultorLogado.slug || '';

        // Pega TODOS os leads do Firestore
        const snapshot = await db.collection('leads').get();
        const todosOsLeads = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        console.log("Total de leads brutos encontrados no Firestore:", todosOsLeads.length);

        // Filtro flexível para exibir os seus leads e os testes pendentes
        this.leads = todosOsLeads.filter(l => {
          const leadRef = String(l.consultorCpf || '').trim();
          
          // Se o lead pertencer ao seu CPF, ao seu Slug, ou se for genérico ('PADRAO' / vazio), ele aparece!
          return (
            leadRef === cpfLogado || 
            leadRef === slugLogado || 
            leadRef === 'PADRAO' || 
            leadRef === '' ||
            leadRef.includes(cpfLogado)
          );
        });

        // Ordena por data (mais recente primeiro)
        this.leads.sort((a, b) => {
          const tA = a.dataCriacao?.seconds || 0;
          const tB = b.dataCriacao?.seconds || 0;
          return tB - tA;
        });

        console.log(`Leads exibidos para o consultor ${this.consultorLogado.nome}:`, this.leads.length);
      } catch (e) {
        console.error("Erro ao carregar leads:", e);
        alert("Erro ao carregar leads. Veja o console (F12).");
      } finally {
        this.carregando = false;
      }
    },

    // ✏️ ATUALIZAR PERFIL (#2)
    async atualizarPerfil() {
      this.salvandoPerfil = true;
      try {
        const updateData = {
          nome: this.formPerfil.nome,
          empresaHonda: this.formPerfil.empresaHonda,
          whatsapp: this.formPerfil.whatsapp.replace(/\D/g, '')
        };
        if (this.formPerfil.novaSenha) {
          updateData.senha = this.formPerfil.novaSenha;
        }

        await db.collection('consultores').doc(this.consultorLogado.cpf).update(updateData);
        
        this.consultorLogado = { ...this.consultorLogado, ...updateData };
        localStorage.setItem('zappmotos_consultor', JSON.stringify(this.consultorLogado));
        alert("Dados atualizados com sucesso!");
      } catch (e) {
        console.error("Erro ao atualizar perfil:", e);
      } finally {
        this.salvandoPerfil = false;
      }
    },

    // 🔗 GERA O LINK PÚBLICO SEGURO DO VENDEDOR (Garante o Slug e oculta o CPF)
    gerarMeuLinkPublico() {
      if (!this.consultorLogado) return '';
      
      let slug = this.consultorLogado.slug;
      if (!slug) {
        const nomeBruto = this.consultorLogado.nome || 'consultor';
        const primeiroNome = nomeBruto.trim().split(' ')[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const randomId = Math.random().toString(36).substring(2, 7);
        slug = `${primeiroNome}-${randomId}`;
        
        this.consultorLogado.slug = slug;
        db.collection('consultores').doc(this.consultorLogado.cpf).update({ slug: slug });
        localStorage.setItem('zappmotos_consultor', JSON.stringify(this.consultorLogado));
      }

      const origin = window.location.origin;
      return `${origin}/index.html?ref=${slug}`;
    },

    copiarLink() {
      const link = this.gerarMeuLinkPublico();
      navigator.clipboard.writeText(link);
      this.copiado = true;
      setTimeout(() => this.copiado = false, 3000);
    },

    formatarData(ts) {
      if (!ts) return '—';
      const d = ts.toDate ? ts.toDate() : new Date(ts);
      return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    },
    formatarTelefone(zap) {
      if (!zap || zap.length !== 11) return zap || '—';
      return `(${zap.substring(0,2)}) ${zap.substring(2,7)}-${zap.substring(7)}`;
    },
    corEtapa(etapa) {
      if (etapa === 4) return 'bg-success text-white';
      if (etapa === 3) return 'bg-primary text-white';
      if (etapa === 2) return 'bg-warning text-dark';
      return 'bg-secondary text-white';
    },
    gerarLinkZap(lead) {
      const num = lead.whatsapp ? lead.whatsapp.replace(/\D/g, '') : '';
      const msg = encodeURIComponent(`Olá ${lead.nome}! Sou o consultor ${this.consultorLogado.nome} da Honda (${this.consultorLogado.empresaHonda}). Vi sua simulação no Zappmotos para a ${lead.motoInteresse || 'moto Honda'}. Podemos conversar sobre a sua entrada?`);
      return `https://wa.me/55${num}?text=${msg}`;
    },
    exportarCSV() {
      if (!this.leadsFiltrados.length) return;
      let csv = "\uFEFFNome;WhatsApp;Estado;Cidade;Orcamento Mensal;Moto de Interesse;Prazo Parcelas;Etapa Alcancada;Aceitou LGPD;Data Cadastro\n";
      this.leadsFiltrados.forEach(l => {
        const data = this.formatarData(l.dataCriacao);
        csv += `"${l.nome||''}";"${l.whatsapp||''}";"${l.uf||''}";"${l.cidade||''}";"${l.orcamento||0}";"${l.motoInteresse||''}";"${l.planoMeses||''}";"Etapa ${l.etapaAlcancada||1}";"${l.aceitouTermos?'Sim':'Não'}";"${data}"\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zappmotos_leads_${new Date().toISOString().slice(0,10)}.csv`;
      a.click();
    }
  },
  mounted() {
    // Restaura sessão se houver no localStorage
    const consultorSalvo = localStorage.getItem('zappmotos_consultor');
    if (consultorSalvo) {
      try {
        this.entrarSessao(JSON.parse(consultorSalvo));
      } catch (e) {}
    }
  }
}).mount('#app');