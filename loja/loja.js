// --- CONFIGURAÇÃO DO FIREBASE (PAINEL CONCESSIONÁRIA) ---
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
      abaAuth: 'login',
      abaAtual: 'planos',
      lojaLogada: null,
      carregandoAuth: false,
      mostrarSenha: false,
      codigoCopiado: false,
      importandoJson: false, // 👈 Estado para o botão de importação

      // Listas IBGE
      estados: [],
      cidades: [],

      formLogin: { cnpj: '', senha: '' },
      formCadastro: { nomeLoja: '', cnpj: '', uf: '', cidade: '', senha: '' },

      // Gestão de Motos e Planos
      motos: [],
      carregandoMotos: false,
      salvandoMoto: false,
      editandoId: null,
      formMoto: {
        modelo: '',
        valorCredito: '',
        imagem: 'img/',
        planos: [
          { meses: 80, parcela: '' },
          { meses: 60, parcela: '' }
        ]
      },

      // Equipe de Vendedores
      vendedores: []
    };
  },
  methods: {
    mascararCnpj(formName) {
      let v = this[formName].cnpj.replace(/\D/g, '');
      if (v.length > 14) v = v.slice(0, 14);
      v = v.replace(/^(\d{2})(\d)/, '$1.$2');
      v = v.replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3');
      v = v.replace(/\.(\d{3})(\d)/, '.$1/$2');
      v = v.replace(/(\d{4})(\d)/, '$1-$2');
      this[formName].cnpj = v;
    },
    limparNumeros(str) {
      return (str || '').replace(/\D/g, '');
    },
    formatarCnpj(cnpj) {
      const v = this.limparNumeros(cnpj);
      if (v.length !== 14) return cnpj;
      return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    },
    formatarMoeda(valor) {
      const num = parseFloat(valor);
      if (isNaN(num)) return '0,00';
      return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    async carregarCidades() {
      this.formCadastro.cidade = '';
      if (!this.formCadastro.uf) {
        this.cidades = [];
        return;
      }
      try {
        const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${this.formCadastro.uf}/municipios?orderBy=nome`);
        this.cidades = await res.json();
      } catch (e) {
        console.error("Erro ao carregar cidades do IBGE:", e);
      }
    },

    // 🏢 CADASTRO DA CONCESSIONÁRIA COM CÓDIGO DE SEGURANÇA ÚNICO
    async cadastrarLoja() {
      const cnpjLimpo = this.limparNumeros(this.formCadastro.cnpj);
      if (cnpjLimpo.length !== 14) {
        alert("Digite um CNPJ válido com 14 dígitos.");
        return;
      }
      this.carregandoAuth = true;

      try {
        const docRef = db.collection('concessionarias').doc(cnpjLimpo);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
          alert("Este CNPJ já está cadastrado. Faça login!");
          this.abaAuth = 'login';
          return;
        }

        // Gera código único de segurança (Ex: HONDA-4829)
        const sufixo = Math.random().toString(36).substring(2, 6).toUpperCase();
        const codigoGerado = `HONDA-${sufixo}`;

        const dadosLoja = {
          cnpj: cnpjLimpo,
          nomeLoja: this.formCadastro.nomeLoja.trim(),
          cidade: this.formCadastro.cidade.trim(),
          uf: this.formCadastro.uf,
          senha: this.formCadastro.senha,
          codigoAcesso: codigoGerado,
          dataCriacao: firebase.firestore.FieldValue.serverTimestamp()
        };

        await docRef.set(dadosLoja);
        this.entrarSessao(dadosLoja);
      } catch (e) {
        console.error("Erro ao cadastrar loja:", e);
        alert("Erro ao cadastrar concessionária: " + e.message);
      } finally {
        this.carregandoAuth = false;
      }
    },

    // 🔑 LOGIN DA CONCESSIONÁRIA
    async realizarLogin() {
      const cnpjLimpo = this.limparNumeros(this.formLogin.cnpj);
      this.carregandoAuth = true;

      try {
        const docSnap = await db.collection('concessionarias').doc(cnpjLimpo).get();
        if (!docSnap.exists) {
          alert("CNPJ não encontrado.");
          return;
        }

        const loja = docSnap.data();
        if (loja.senha !== this.formLogin.senha) {
          alert("Senha incorreta.");
          return;
        }

        this.entrarSessao(loja);
      } catch (e) {
        console.error("Erro no login da loja:", e);
        alert("Erro ao acessar painel.");
      } finally {
        this.carregandoAuth = false;
      }
    },

    entrarSessao(loja) {
      this.lojaLogada = loja;
      localStorage.setItem('zappmotos_loja', JSON.stringify(loja));
      this.carregarMotos();
      this.carregarVendedores();
    },
    deslogar() {
      this.lojaLogada = null;
      localStorage.removeItem('zappmotos_loja');
    },
    copiarCodigo() {
      navigator.clipboard.writeText(this.lojaLogada.codigoAcesso);
      this.codigoCopiado = true;
      setTimeout(() => this.codigoCopiado = false, 2500);
    },

    // 🏍️ GESTÃO DE MOTOS E PLANOS NO FIRESTORE
    adicionarPlano() {
      this.formMoto.planos.push({ meses: '', parcela: '' });
    },
    removerPlano(index) {
      this.formMoto.planos.splice(index, 1);
    },
    async salvarMoto() {
      this.salvandoMoto = true;
      try {
        const planosOrdenados = [...this.formMoto.planos]
          .map(p => ({ meses: Number(p.meses), parcela: Number(p.parcela) }))
          .sort((a, b) => b.meses - a.meses);

        const payload = {
          concessionariaId: this.lojaLogada.cnpj,
          codigoAcesso: this.lojaLogada.codigoAcesso,
          modelo: this.formMoto.modelo.trim().toUpperCase(),
          valorCredito: Number(this.formMoto.valorCredito),
          imagem: this.formMoto.imagem.trim(),
          planos: planosOrdenados,
          ativo: true,
          atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (this.editandoId) {
          await db.collection('planos_consorcio').doc(this.editandoId).update(payload);
        } else {
          await db.collection('planos_consorcio').add(payload);
        }

        this.cancelarEdicao();
        await this.carregarMotos();
      } catch (e) {
        console.error("Erro ao salvar moto:", e);
        alert("Erro ao salvar plano: " + e.message);
      } finally {
        this.salvandoMoto = false;
      }
    },
    editarMoto(moto) {
      this.editandoId = moto.id;
      this.formMoto = {
        modelo: moto.modelo,
        valorCredito: moto.valorCredito,
        imagem: moto.imagem,
        planos: JSON.parse(JSON.stringify(moto.planos || []))
      };
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    cancelarEdicao() {
      this.editandoId = null;
      this.formMoto = {
        modelo: '',
        valorCredito: '',
        imagem: 'img/',
        planos: [
          { meses: 80, parcela: '' },
          { meses: 60, parcela: '' }
        ]
      };
    },
    async alternarStatusMoto(moto) {
      const novoStatus = moto.ativo === false ? true : false;
      await db.collection('planos_consorcio').doc(moto.id).update({ ativo: novoStatus });
      moto.ativo = novoStatus;
    },
    async excluirMoto(id) {
      if (!confirm("Tem certeza que deseja excluir este modelo da tabela?")) return;
      await db.collection('planos_consorcio').doc(id).delete();
      await this.carregarMotos();
    },
    async carregarMotos() {
      if (!this.lojaLogada) return;
      this.carregandoMotos = true;
      try {
        const snap = await db.collection('planos_consorcio')
          .where('concessionariaId', '==', this.lojaLogada.cnpj)
          .get();
        this.motos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (e) {
        console.error("Erro ao carregar motos:", e);
      } finally {
        this.carregandoMotos = false;
      }
    },

   // 📥 IMPORTAR MOTOS E PLANOS DIRETAMENTE DO motos.json PARA O FIRESTORE
    async importarMotosJson() {
      if (!this.lojaLogada) return;
      if (!confirm("Deseja importar todos os modelos e planos do arquivo motos.json para o painel desta concessionária?")) return;
      
      this.importandoJson = true;
      try {
        const response = await fetch('../motos.json');
        if (!response.ok) throw new Error("Não foi possível encontrar o arquivo motos.json na raiz do projeto.");
        const motosJson = await response.json();

        // Identifica a lista correta dentro de "catalogo_honda" conforme o seu JSON
        const lista = Array.isArray(motosJson) 
          ? motosJson 
          : (motosJson.catalogo_honda || motosJson.motos || Object.values(motosJson).find(val => Array.isArray(val)) || []);

        let importadas = 0;
        for (const moto of lista) {
          // Mapeia os planos convertendo 'parcelas' para 'meses' e 'valor' para 'parcela'[cite: 9]
          const planosMapeados = (moto.planos || []).map(p => ({
            meses: Number(p.parcelas || p.meses || 0),
            parcela: Number(p.valor || p.parcela || 0)
          })).sort((a, b) => b.meses - a.meses);

          // Estima o valor de crédito base caso o campo não exista diretamente no objeto principal
          const maiorPlano = planosMapeados[0];
          const creditoEstimado = maiorPlano ? (maiorPlano.parcela * maiorPlano.meses * 0.65) : 15000;

          const payload = {
            concessionariaId: this.lojaLogada.cnpj,
            codigoAcesso: this.lojaLogada.codigoAcesso,
            modelo: (moto.modelo || moto.nome || '').trim().toUpperCase(),
            valorCredito: Number(moto.valorCredito || moto.valor || Math.round(creditoEstimado)),
            imagem: (moto.imagem || 'img/').trim(),
            planos: planosMapeados,
            ativo: true,
            atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
          };

          if (payload.modelo) {
            await db.collection('planos_consorcio').add(payload);
            importadas++;
          }
        }

        alert(`Sucesso! ${importadas} modelos foram importados do motos.json para o Firestore.`);
        await this.carregarMotos();
      } catch (e) {
        console.error("Erro ao importar motos.json:", e);
        alert("Erro ao importar arquivo: " + e.message);
      } finally {
        this.importandoJson = false;
      }
    },

    // 👥 GESTÃO DA EQUIPE DE VENDEDORES
    async carregarVendedores() {
      if (!this.lojaLogada) return;
      try {
        const snap = await db.collection('consultores')
          .where('concessionariaId', '==', this.lojaLogada.cnpj)
          .get();
        this.vendedores = snap.docs.map(doc => doc.data());
      } catch (e) {
        console.error("Erro ao carregar equipe:", e);
      }
    },
    async alternarStatusVendedor(vendedor) {
      const novoStatus = vendedor.ativo === false ? true : false;
      await db.collection('consultores').doc(vendedor.cpf).update({ ativo: novoStatus });
      vendedor.ativo = novoStatus;
    }
  },
  mounted() {
    this.carregarEstados();

    const lojaSalva = localStorage.getItem('zappmotos_loja');
    if (lojaSalva) {
      try {
        this.entrarSessao(JSON.parse(lojaSalva));
      } catch (e) {}
    }
  }
}).mount('#app');