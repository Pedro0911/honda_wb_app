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

// Número de WhatsApp do suporte/renovação (DDI + DDD + Número)
const WHATSAPP_SUPORTE_ZAPPMOTOS = "5582999679667";

const { createApp } = Vue;

createApp({
  data() {
    return {
      abaAuth: 'login',
      abaAtual: 'leads',
      consultorLogado: null,
      carregandoAuth: false,
      carregando: false,
      salvandoPerfil: false,
      excluindoLeadId: null,
      copiado: false,
      exibirModalTermosConsultor: false,
      avisoAcesso: null,

      mostrarSenhaLogin: false,
      mostrarSenhaCadastro: false,

      // Listas IBGE
      estados: [],
      cidades: [],
      cidadesPerfil: [],

      formLogin: { cpf: '', senha: '' },

      // Form Cadastro com Código da Marca + Loja + UF/Cidade
      formCadastro: { 
        nome: '', 
        cpf: '', 
        codigoAcesso: '',
        nomeLoja: '',
        uf: '',
        cidade: '',
        whatsapp: '', 
        instagram: '',
        senha: '', 
        aceitouTermos: false 
      },

      // Form Perfil
      formPerfil: { 
        nome: '', 
        empresaHonda: '',
        uf: '',
        cidade: '',
        whatsapp: '', 
        instagram: '',
        novaSenha: '' 
      },

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
    },
    textoValidadeAssinatura() {
      if (!this.consultorLogado || !this.consultorLogado.assinaturaValidaAte) return '';
      const d = this.parseDataValidade(this.consultorLogado.assinaturaValidaAte);
      if (!d) return '';
      return d.toLocaleDateString('pt-BR');
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
    limparInstagram(valor) {
      if (!valor) return '';
      return valor
        .trim()
        .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '')
        .replace(/^@/, '')
        .replace(/\/.*$/, '')
        .trim();
    },
    formatarMoeda(valor) {
      if (typeof valor !== 'number') return '0,00';
      return valor.toFixed(2).replace('.', ',');
    },
    deslogar() {
      this.consultorLogado = null;
      localStorage.removeItem('zappmotos_consultor');
    },

    // 📍 API DO IBGE (Estados e Cidades)
    async carregarEstados() {
      try {
        const res = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome');
        this.estados = await res.json();
      } catch (e) {
        console.error("Erro ao carregar estados do IBGE:", e);
      }
    },
    async carregarCidades(targetForm = 'formCadastro', manterCidadeAtual = false) {
      const uf = this[targetForm].uf;
      if (!manterCidadeAtual) {
        this[targetForm].cidade = '';
      }
      if (!uf) {
        if (targetForm === 'formPerfil') this.cidadesPerfil = [];
        else this.cidades = [];
        return;
      }
      try {
        const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`);
        const lista = await res.json();
        if (targetForm === 'formPerfil') {
          this.cidadesPerfil = lista;
        } else {
          this.cidades = lista;
        }
      } catch (e) {
        console.error("Erro ao carregar cidades do IBGE:", e);
      }
    },

    // 🛡️ VERIFICAÇÃO AUTOMÁTICA DE ASSINATURA E ACESSO
    parseDataValidade(valor) {
      if (!valor) return null;
      if (valor.toDate) return valor.toDate();
      if (valor.seconds) return new Date(valor.seconds * 1000);
      const d = new Date(valor);
      return isNaN(d.getTime()) ? null : d;
    },

    async verificarPermissaoAssinatura(consultor) {
      if (consultor.ativo === false) {
        const msg = encodeURIComponent(`Olá! Meu acesso ao Zappmotos (CPF ${consultor.cpf}) está bloqueado. Gostaria de regularizar.`);
        this.avisoAcesso = {
          tipo: 'bloqueada',
          titulo: 'Acesso Temporariamente Bloqueado',
          mensagem: 'Sua conta está bloqueada no sistema. Entre em contato com o suporte para liberar seu acesso.',
          linkSuporte: `https://wa.me/${WHATSAPP_SUPORTE_ZAPPMOTOS}?text=${msg}`
        };
        return false;
      }

      const tipo = consultor.tipoAcesso || 'ASSINANTE';
      if (tipo === 'VIP') {
        this.avisoAcesso = null;
        return true;
      }

      const dataValidade = this.parseDataValidade(consultor.assinaturaValidaAte);
      if (dataValidade) {
        const fimDoDia = new Date(dataValidade.getFullYear(), dataValidade.getMonth(), dataValidade.getDate(), 23, 59, 59);
        if (new Date() > fimDoDia) {
          // Sincroniza bloqueio automático no Firestore
          try {
            await db.collection('consultores').doc(consultor.cpf).update({ ativo: false });
          } catch (e) {
            console.error("Erro ao atualizar status vencido:", e);
          }

          const dataFormatada = dataValidade.toLocaleDateString('pt-BR');
          const msg = encodeURIComponent(`Olá! Minha assinatura do Zappmotos (CPF ${consultor.cpf}) venceu em ${dataFormatada}. Quero renovar meu acesso!`);
          this.avisoAcesso = {
            tipo: 'vencida',
            titulo: `Assinatura Vencida em ${dataFormatada}`,
            mensagem: 'Seu período de acesso expirou. Renove sua assinatura agora para continuar captando e atendendo seus leads.',
            linkSuporte: `https://wa.me/${WHATSAPP_SUPORTE_ZAPPMOTOS}?text=${msg}`
          };
          return false;
        }
      }

      this.avisoAcesso = null;
      return true;
    },

    // 🔑 CADASTRO DE CONSULTOR (CÓDIGO DA MARCA + LOJA LIVRE + 7 DIAS GRÁTIS)
    async cadastrarConsultor() {
      const cpfLimpo = this.limparCpf(this.formCadastro.cpf);
      const codigoInput = (this.formCadastro.codigoAcesso || '').trim().toUpperCase();

      if (cpfLimpo.length !== 11) {
        alert("Por favor, digite um CPF válido com 11 dígitos.");
        return;
      }

      if (!this.formCadastro.aceitouTermos) {
        alert("Você precisa ler e aceitar os Termos de Uso e Responsabilidade para criar sua conta.");
        return;
      }

      this.carregandoAuth = true;

      try {
        const queryMarca = await db.collection('concessionarias')
          .where('codigoAcesso', '==', codigoInput)
          .get();

        if (queryMarca.empty) {
          alert("Código da Marca inválido ou não encontrado. Verifique o código e tente novamente.");
          this.carregandoAuth = false;
          return;
        }

        const marcaDoc = queryMarca.docs[0];
        const dadosMarca = marcaDoc.data();
        const marcaId = marcaDoc.id;
        const marcaNome = (dadosMarca.marca || codigoInput.split('-')[0] || 'HONDA').trim().toUpperCase();

        const docRef = db.collection('consultores').doc(cpfLimpo);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
          alert("Este CPF já está cadastrado no Zappmotos. Faça login!");
          this.abaAuth = 'login';
          return;
        }

        const nomeBruto = this.formCadastro.nome || 'consultor';
        const primeiroNome = nomeBruto.trim().split(' ')[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const randomId = Math.random().toString(36).substring(2, 7);
        const slugSeguro = `${primeiroNome}-${randomId}`;

        // Concede 7 dias de teste gratuito a partir do cadastro
        const validadeTeste = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        const dadosConsultor = {
          cpf: cpfLimpo,
          slug: slugSeguro,
          nome: this.formCadastro.nome.trim(),
          marca: marcaNome,
          codigoAcesso: codigoInput,
          empresaHonda: this.formCadastro.nomeLoja.trim(),
          uf: this.formCadastro.uf,
          cidade: this.formCadastro.cidade,
          concessionariaId: marcaId,
          whatsapp: this.formCadastro.whatsapp.replace(/\D/g, ''),
          instagram: this.limparInstagram(this.formCadastro.instagram),
          senha: this.formCadastro.senha,
          tipoAcesso: 'ASSINANTE',
          assinaturaValidaAte: validadeTeste,
          ativo: true,
          aceitouTermosConsultor: true,
          termoConsultorVersao: "v1.0 - 2026",
          dataAceiteTermos: firebase.firestore.FieldValue.serverTimestamp(),
          dataCriacao: firebase.firestore.FieldValue.serverTimestamp()
        };

        await docRef.set(dadosConsultor);
        await this.entrarSessao(dadosConsultor);
      } catch (e) {
        console.error("Erro ao cadastrar consultor:", e);
        alert("Erro ao realizar cadastro: " + e.message);
      } finally {
        this.carregandoAuth = false;
      }
    },

    // 🔑 LOGIN DE CONSULTOR
    async realizarLogin() {
      const cpfLimpo = this.limparCpf(this.formLogin.cpf);
      this.carregandoAuth = true;
      this.avisoAcesso = null;

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

        const permitido = await this.verificarPermissaoAssinatura(consultor);
        if (!permitido) {
          return;
        }

        await this.entrarSessao(consultor);
      } catch (e) {
        console.error("Erro no login:", e);
        alert("Erro ao efetuar login.");
      } finally {
        this.carregandoAuth = false;
      }
    },

    async entrarSessao(consultor) {
      this.consultorLogado = consultor;
      this.formPerfil.nome = consultor.nome || '';
      this.formPerfil.empresaHonda = consultor.empresaHonda || '';
      this.formPerfil.uf = consultor.uf || '';
      this.formPerfil.cidade = consultor.cidade || '';
      this.formPerfil.whatsapp = consultor.whatsapp || '';
      this.formPerfil.instagram = consultor.instagram || '';

      if (consultor.uf) {
        this.carregarCidades('formPerfil', true);
      }

      localStorage.setItem('zappmotos_consultor', JSON.stringify(this.consultorLogado));
      this.carregarLeads();
    },

    // 📊 CARREGA APENAS OS LEADS DO CONSULTOR LOGADO
    async carregarLeads() {
      if (!this.consultorLogado) return;
      this.carregando = true;
      try {
        const cpfLogado = String(this.consultorLogado.cpf || '').replace(/\D/g, '').trim();
        const slugLogado = String(this.consultorLogado.slug || '').trim();

        const snapshot = await db.collection('leads').get();
        const todosOsLeads = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        this.leads = todosOsLeads.filter(l => {
          const leadRef = String(l.consultorCpf || '').trim();
          const leadSlug = String(l.consultorSlug || '').trim();

          const bateCpf = cpfLogado && leadRef === cpfLogado;
          const bateSlug = (slugLogado && leadRef === slugLogado) || (slugLogado && leadSlug === slugLogado);

          return bateCpf || bateSlug;
        });

        this.leads.sort((a, b) => {
          const tA = a.dataCriacao?.seconds || 0;
          const tB = b.dataCriacao?.seconds || 0;
          return tB - tA;
        });
      } catch (e) {
        console.error("Erro ao carregar leads:", e);
        alert("Erro ao carregar leads. Veja o console (F12).");
      } finally {
        this.carregando = false;
      }
    },

    // 🗑️ EXCLUIR LEAD DO FIRESTORE E DA TABELA
    async excluirLead(lead) {
      if (!lead || !lead.id) return;

      const nomeLead = lead.nome || 'este lead';
      const confirmou = confirm(`Tem certeza que deseja excluir "${nomeLead}"? Essa ação não pode ser desfeita.`);
      if (!confirmou) return;

      this.excluindoLeadId = lead.id;

      try {
        await db.collection('leads').doc(lead.id).delete();
        this.leads = this.leads.filter(item => item.id !== lead.id);
      } catch (e) {
        console.error("Erro ao excluir lead:", e);
        alert("Não foi possível excluir o lead. Tente novamente.");
      } finally {
        this.excluindoLeadId = null;
      }
    },

    // ✏️ ATUALIZAR PERFIL
    async atualizarPerfil() {
      this.salvandoPerfil = true;
      try {
        const instaLimpo = this.limparInstagram(this.formPerfil.instagram);
        const updateData = {
          nome: this.formPerfil.nome.trim(),
          empresaHonda: this.formPerfil.empresaHonda.trim(),
          uf: this.formPerfil.uf,
          cidade: this.formPerfil.cidade,
          whatsapp: this.formPerfil.whatsapp.replace(/\D/g, ''),
          instagram: instaLimpo
        };
        if (this.formPerfil.novaSenha) {
          updateData.senha = this.formPerfil.novaSenha;
        }

        await db.collection('consultores').doc(this.consultorLogado.cpf).update(updateData);
        
        this.formPerfil.instagram = instaLimpo;
        this.consultorLogado = { ...this.consultorLogado, ...updateData };
        localStorage.setItem('zappmotos_consultor', JSON.stringify(this.consultorLogado));
        alert("Dados atualizados com sucesso!");
      } catch (e) {
        console.error("Erro ao atualizar perfil:", e);
        alert("Erro ao atualizar perfil.");
      } finally {
        this.salvandoPerfil = false;
      }
    },

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

      const baseUrl = window.location.hostname.includes('github.io') 
        ? `${window.location.origin}/honda_wb_app/` 
        : `${window.location.origin}/`;

      return `${baseUrl}index.html?ref=${slug}`;
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
      const marca = this.consultorLogado.marca || 'Honda';
      const loja = this.consultorLogado.empresaHonda ? ` (${this.consultorLogado.empresaHonda})` : '';
      const msg = encodeURIComponent(`Olá ${lead.nome}! Sou o consultor ${this.consultorLogado.nome} da ${marca}${loja}. Vi sua simulação no Zappmotos para a ${lead.motoInteresse || 'moto'}. Podemos conversar sobre a sua entrada?`);
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
  async mounted() {
    this.carregarEstados();

    const consultorSalvo = localStorage.getItem('zappmotos_consultor');
    if (consultorSalvo) {
      try {
        const parsed = JSON.parse(consultorSalvo);
        // Revalida o status atualizado direto no Firestore ao abrir o painel
        const docSnap = await db.collection('consultores').doc(parsed.cpf).get();
        if (docSnap.exists) {
          const consultorAtualizado = docSnap.data();
          const permitido = await this.verificarPermissaoAssinatura(consultorAtualizado);
          if (permitido) {
            await this.entrarSessao(consultorAtualizado);
          } else {
            this.deslogar();
          }
        } else {
          this.deslogar();
        }
      } catch (e) {
        console.error("Erro ao restaurar sessão:", e);
      }
    }
  }
}).mount('#app');