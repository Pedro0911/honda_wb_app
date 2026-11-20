// --- CONFIGURAÇÃO DO FIREBASE (PAINEL MASTER ZAPP MOTOS) ---
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

// Credencial padrão de fallback do Master (pode ser sobrescrita no Firestore em config_master/acesso)
const MASTER_FALLBACK = {
  nome: "Pedro (Master)",
  usuario: "admin@zappmotos.com",
  senha: "change-me-master-2026"
};

const { createApp } = Vue;

createApp({
  data() {
    return {
      abaAtual: 'assinantes',
      masterLogado: null,
      carregandoAuth: false,
      mostrarSenha: false,
      importandoJson: false,
      salvandoMarca: false,

      formLoginMaster: {
        identificador: '',
        senha: ''
      },

      // Marcas e Códigos (armazenados na coleção 'concessionarias' para manter compatibilidade)
      marcas: [],
      marcaSelecionadaId: '',
      formMarca: {
        marca: '',
        codigoAcesso: ''
      },

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

      // Assinantes / Consultores
      assinantes: [],
      carregandoAssinantes: false,
      filtroCpfAssinante: '',
      filtroMarcaAssinante: ''
    };
  },
  computed: {
    marcaAtualObj() {
      return this.marcas.find(m => m.id === this.marcaSelecionadaId) || null;
    },
    marcasDisponiveisFiltro() {
      const setMarcas = new Set();
      this.marcas.forEach(m => {
        if (m.marca) setMarcas.add(String(m.marca).trim().toUpperCase());
      });
      this.assinantes.forEach(u => {
        const marcaCalc = this.obterMarcaUsuario(u);
        if (marcaCalc && marcaCalc !== 'OUTRA') setMarcas.add(marcaCalc);
      });
      return Array.from(setMarcas).sort();
    },
    assinantesFiltrados() {
      const busca = (this.filtroCpfAssinante || '').trim().toLowerCase();
      const buscaNumeros = this.limparNumeros(busca);
      const marcaFiltro = (this.filtroMarcaAssinante || '').trim().toUpperCase();

      return this.assinantes.filter(u => {
        const cpfLimpo = this.limparNumeros(u.cpf);
        const nome = (u.nome || '').toLowerCase();
        const zap = this.limparNumeros(u.whatsapp);

        const bateBusca = !busca ||
          (buscaNumeros && (cpfLimpo.includes(buscaNumeros) || zap.includes(buscaNumeros))) ||
          nome.includes(busca);

        const marcaUser = this.obterMarcaUsuario(u);
        const bateMarca = !marcaFiltro || marcaUser === marcaFiltro;

        return bateBusca && bateMarca;
      });
    },
    totalUsuariosAtivos() {
      return this.assinantes.filter(u => this.statusEfetivoUsuario(u).liberado).length;
    },
    totalUsuariosVip() {
      return this.assinantes.filter(u => (u.tipoAcesso || 'ASSINANTE') === 'VIP').length;
    },
    totalAssinaturasVencidas() {
      return this.assinantes.filter(u => this.statusEfetivoUsuario(u).vencido).length;
    }
  },
  methods: {
    limparNumeros(str) {
      return (str || '').replace(/\D/g, '');
    },
    formatarCpf(cpf) {
      const v = this.limparNumeros(cpf);
      if (v.length !== 11) return cpf || '—';
      return v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    },
    formatarMoeda(valor) {
      const num = parseFloat(valor);
      if (isNaN(num)) return '0,00';
      return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    copiarTexto(texto) {
      if (!texto) return;
      navigator.clipboard.writeText(texto);
      alert(`Código "${texto}" copiado!`);
    },

    // 🔐 LOGIN EXCLUSIVO DO MASTER
    async realizarLoginMaster() {
      this.carregandoAuth = true;
      try {
        const inputId = (this.formLoginMaster.identificador || '').trim().toLowerCase();
        const inputSenha = this.formLoginMaster.senha || '';

        let credencial = MASTER_FALLBACK;
        const docConfig = await db.collection('config_master').doc('acesso').get();
        if (docConfig.exists) {
          credencial = { ...MASTER_FALLBACK, ...docConfig.data() };
        }

        const usuarioValido = String(credencial.usuario || '').trim().toLowerCase();
        const senhaValida = String(credencial.senha || '');

        if (inputId === usuarioValido && inputSenha === senhaValida) {
          const sessaoMaster = {
            nome: credencial.nome || 'Administrador Master',
            usuario: usuarioValido,
            logadoEm: new Date().toISOString()
          };
          this.entrarSessaoMaster(sessaoMaster);
        } else {
          alert("Credenciais Master inválidas.");
        }
      } catch (e) {
        console.error("Erro no login master:", e);
        alert("Erro ao validar acesso master.");
      } finally {
        this.carregandoAuth = false;
      }
    },

    entrarSessaoMaster(sessao) {
      this.masterLogado = sessao;
      localStorage.setItem('zappmotos_master', JSON.stringify(sessao));
      this.carregarMarcas();
      this.carregarAssinantes();
    },

    deslogar() {
      this.masterLogado = null;
      localStorage.removeItem('zappmotos_master');
    },

    // 🏷️ MARCAS & CÓDIGOS DE ACESSO (MARCA ÚNICA)
    gerarCodigoMarca(marcaNome) {
      const prefixo = (marcaNome || 'MARCA')
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 10) || 'MARCA';
      const sufixo = Math.random().toString(36).substring(2, 6).toUpperCase();
      return `${prefixo}-${sufixo}`;
    },

    async carregarMarcas() {
      try {
        const snap = await db.collection('concessionarias').get();
        this.marcas = snap.docs.map(doc => {
          const data = doc.data();
          const marcaDerivada = data.marca || (data.codigoAcesso ? String(data.codigoAcesso).split('-')[0] : 'HONDA');
          return {
            id: doc.id,
            ...data,
            marca: String(marcaDerivada || 'HONDA').trim().toUpperCase()
          };
        });

        if (!this.marcaSelecionadaId && this.marcas.length > 0) {
          this.marcaSelecionadaId = this.marcas[0].id;
        }
        if (this.marcaSelecionadaId) {
          this.carregarMotos();
        }
      } catch (e) {
        console.error("Erro ao carregar marcas:", e);
      }
    },

    async criarMarcaCodigo() {
      const marcaLimpa = (this.formMarca.marca || '')
        .trim()
        .toUpperCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^A-Z0-9]/g, '');

      const codigoCustom = (this.formMarca.codigoAcesso || '').trim().toUpperCase();

      if (!marcaLimpa) {
        alert("Digite o nome da marca (ex: HONDA, YAMAHA).");
        return;
      }

      const marcaJaExiste = this.marcas.some(m => m.marca === marcaLimpa);
      if (marcaJaExiste) {
        alert(`A marca "${marcaLimpa}" já está cadastrada. Use a tabela ao lado para gerenciar os planos ou gerar um novo código.`);
        return;
      }

      this.salvandoMarca = true;
      try {
        const codigoFinal = codigoCustom || this.gerarCodigoMarca(marcaLimpa);
        const docId = marcaLimpa;

        const payload = {
          cnpj: docId,
          marca: marcaLimpa,
          nomeLoja: marcaLimpa,
          codigoAcesso: codigoFinal,
          ativo: true,
          atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
          dataCriacao: firebase.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('concessionarias').doc(docId).set(payload, { merge: true });
        this.marcaSelecionadaId = docId;
        this.formMarca.marca = '';
        this.formMarca.codigoAcesso = '';
        await this.carregarMarcas();
        alert(`Marca ${marcaLimpa} criada com o código ${codigoFinal}!`);
      } catch (e) {
        console.error("Erro ao salvar marca/código:", e);
        alert("Erro ao salvar marca: " + e.message);
      } finally {
        this.salvandoMarca = false;
      }
    },

    async regenerarCodigoMarca(marcaObj) {
      const novoCodigo = this.gerarCodigoMarca(marcaObj.marca);
      if (!confirm(`Gerar novo código "${novoCodigo}" para a marca ${marcaObj.marca}?`)) return;

      await db.collection('concessionarias').doc(marcaObj.id).update({
        codigoAcesso: novoCodigo,
        atualizadoEm: firebase.firestore.FieldValue.serverTimestamp()
      });
      await this.carregarMarcas();
    },

    selecionarMarcaParaPlanos(id) {
      this.marcaSelecionadaId = id;
      this.abaAtual = 'planos';
      this.carregarMotos();
    },

    contarVendedoresPorMarca(marcaObj) {
      if (!marcaObj) return 0;
      const marcaAlvo = String(marcaObj.marca || '').trim().toUpperCase();
      return this.assinantes.filter(u => this.obterMarcaUsuario(u) === marcaAlvo).length;
    },

    // 👥 ASSINANTES & CONTROLE DE ACESSO (MANUAL + AUTOMÁTICO POR VALIDADE)
    obterMarcaUsuario(u) {
      if (u.marca) return String(u.marca).trim().toUpperCase();
      if (u.codigoAcesso && String(u.codigoAcesso).includes('-')) {
        return String(u.codigoAcesso).split('-')[0].trim().toUpperCase();
      }
      const lojaVinculada = this.marcas.find(m => m.id === u.concessionariaId || m.codigoAcesso === u.codigoAcesso);
      if (lojaVinculada && lojaVinculada.marca) {
        return String(lojaVinculada.marca).trim().toUpperCase();
      }
      if (u.empresaHonda) return 'HONDA';
      return 'OUTRA';
    },

    parseDataValidade(valor) {
      if (!valor) return null;
      if (valor.toDate) return valor.toDate();
      const d = new Date(valor);
      return isNaN(d.getTime()) ? null : d;
    },

    formatarDataInput(valor) {
      const d = this.parseDataValidade(valor);
      if (!d) return '';
      return d.toISOString().slice(0, 10);
    },

    statusEfetivoUsuario(u) {
      if (u.ativo === false) {
        return { texto: 'Bloqueado', classe: 'bg-danger', liberado: false, vencido: false };
      }

      const tipo = u.tipoAcesso || 'ASSINANTE';
      if (tipo === 'VIP') {
        return { texto: 'VIP / Gratuito', classe: 'bg-primary', liberado: true, vencido: false };
      }

      const dataValidade = this.parseDataValidade(u.assinaturaValidaAte);
      if (dataValidade) {
        const fimDoDia = new Date(dataValidade.getFullYear(), dataValidade.getMonth(), dataValidade.getDate(), 23, 59, 59);
        if (new Date() > fimDoDia) {
          return { texto: 'Vencida', classe: 'bg-warning text-dark', liberado: false, vencido: true };
        }
      }

      return { texto: 'Ativo', classe: 'bg-success', liberado: true, vencido: false };
    },

    async carregarAssinantes() {
      this.carregandoAssinantes = true;
      try {
        const snap = await db.collection('consultores').get();
        this.assinantes = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (e) {
        console.error("Erro ao carregar assinantes:", e);
      } finally {
        this.carregandoAssinantes = false;
      }
    },

    async alterarTipoAcesso(usuario, novoTipo) {
      try {
        const updatePayload = { tipoAcesso: novoTipo };
        if (novoTipo === 'VIP') {
          updatePayload.ativo = true;
        }
        await db.collection('consultores').doc(usuario.id).update(updatePayload);
        usuario.tipoAcesso = novoTipo;
        if (novoTipo === 'VIP') usuario.ativo = true;
      } catch (e) {
        console.error("Erro ao atualizar tipo de acesso:", e);
        alert("Erro ao atualizar tipo de acesso.");
      }
    },

    async atualizarValidadeAssinatura(usuario, novaDataStr) {
      try {
        const payload = {
          tipoAcesso: 'ASSINANTE',
          assinaturaValidaAte: novaDataStr ? new Date(`${novaDataStr}T12:00:00`) : null
        };
        await db.collection('consultores').doc(usuario.id).update(payload);
        usuario.tipoAcesso = 'ASSINANTE';
        usuario.assinaturaValidaAte = payload.assinaturaValidaAte;
      } catch (e) {
        console.error("Erro ao atualizar validade:", e);
        alert("Erro ao atualizar validade.");
      }
    },

    async renovar30Dias(usuario) {
      try {
        const baseData = this.parseDataValidade(usuario.assinaturaValidaAte);
        const inicio = baseData && baseData > new Date() ? baseData : new Date();
        const novaData = new Date(inicio.getTime() + 30 * 24 * 60 * 60 * 1000);

        await db.collection('consultores').doc(usuario.id).update({
          tipoAcesso: 'ASSINANTE',
          ativo: true,
          assinaturaValidaAte: novaData
        });

        usuario.tipoAcesso = 'ASSINANTE';
        usuario.ativo = true;
        usuario.assinaturaValidaAte = novaData;
      } catch (e) {
        console.error("Erro ao renovar 30 dias:", e);
        alert("Erro ao renovar assinatura.");
      }
    },

    async alternarStatusUsuario(usuario) {
      const novoStatus = usuario.ativo === false ? true : false;
      await db.collection('consultores').doc(usuario.id).update({ ativo: novoStatus });
      usuario.ativo = novoStatus;
    },

    // 🏍️ GESTÃO DE MOTOS E PLANOS NO FIRESTORE
    adicionarPlano() {
      this.formMoto.planos.push({ meses: '', parcela: '' });
    },
    removerPlano(index) {
      this.formMoto.planos.splice(index, 1);
    },
    async salvarMoto() {
      if (!this.marcaAtualObj) {
        alert("Selecione ou cadastre uma marca antes de salvar.");
        return;
      }
      this.salvandoMoto = true;
      try {
        const planosOrdenados = [...this.formMoto.planos]
          .map(p => ({ meses: Number(p.meses), parcela: Number(p.parcela) }))
          .sort((a, b) => b.meses - a.meses);

        const payload = {
          concessionariaId: this.marcaAtualObj.id,
          codigoAcesso: this.marcaAtualObj.codigoAcesso,
          marca: this.marcaAtualObj.marca,
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
      if (!this.marcaAtualObj) return;
      this.carregandoMotos = true;
      try {
        const snap = await db.collection('planos_consorcio')
          .where('concessionariaId', '==', this.marcaAtualObj.id)
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
      if (!this.marcaAtualObj) return;
      if (!confirm(`Deseja importar os modelos do motos.json para a marca ${this.marcaAtualObj.marca}?`)) return;
      
      this.importandoJson = true;
      try {
        const response = await fetch('../motos.json');
        if (!response.ok) throw new Error("Não foi possível encontrar o arquivo motos.json na raiz do projeto.");
        const motosJson = await response.json();

        const lista = Array.isArray(motosJson) 
          ? motosJson 
          : (motosJson.catalogo_honda || motosJson.motos || Object.values(motosJson).find(val => Array.isArray(val)) || []);

        let importadas = 0;
        for (const moto of lista) {
          const planosMapeados = (moto.planos || []).map(p => ({
            meses: Number(p.parcelas || p.meses || 0),
            parcela: Number(p.valor || p.parcela || 0)
          })).sort((a, b) => b.meses - a.meses);

          const maiorPlano = planosMapeados[0];
          const creditoEstimado = maiorPlano ? (maiorPlano.parcela * maiorPlano.meses * 0.65) : 15000;

          const payload = {
            concessionariaId: this.marcaAtualObj.id,
            codigoAcesso: this.marcaAtualObj.codigoAcesso,
            marca: this.marcaAtualObj.marca,
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
    }
  },
  mounted() {
    const sessaoSalva = localStorage.getItem('zappmotos_master');
    if (sessaoSalva) {
      try {
        this.entrarSessaoMaster(JSON.parse(sessaoSalva));
      } catch (e) {}
    }
  }
}).mount('#app');