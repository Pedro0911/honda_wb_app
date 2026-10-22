const { createApp } = Vue;

createApp({
  data() {
    return {
      etapa: 1,
      // Dados coletados do lead ao longo do funil
      lead: {
        nome: '',
        whatsapp: '',
        cidade: '',
        orcamento: 500
      },
      // Array onde o JSON do catálogo será carregado
      catalogoMotos: [],
      // Controle de carregamento e erro do JSON
      carregandoCatalogo: true,
      erroCatalogo: false,
      // Seleções do cliente para a Tela 4
      motoSelecionada: null,
      planoSelecionado: null
    };
  },
  computed: {
    // Largura dinâmica da barra de progresso do topo
    progressoBarra() {
      if (this.etapa === 2) return '0%';
      if (this.etapa === 3) return '50%';
      if (this.etapa === 4) return '100%';
      return '0%';
    },

    // Filtro reativo: roda automaticamente sempre que 'lead.orcamento' muda na Tela 2
    motosFiltradas() {
      if (!this.catalogoMotos.length) return [];

      let resultado = [];

      this.catalogoMotos.forEach(moto => {
        // Filtra os planos que possuem parcela dentro do valor definido no slider
        const planosValidos = moto.planos.filter(p => p.valor <= this.lead.orcamento);

        if (planosValidos.length > 0) {
          // Pega o plano de maior prazo (gera a menor parcela dentro do orçamento do cliente)
          const melhorPlano = planosValidos.reduce((prev, curr) => 
            (prev.parcelas > curr.parcelas) ? prev : curr
          );

          resultado.push({
            moto: moto,
            plano: melhorPlano
          });
        }
      });

      // Ordena da parcela mais alta (mais próxima do orçamento) para a mais barata
      return resultado.sort((a, b) => b.plano.valor - a.plano.valor);
    }
  },
  methods: {
    voltarEtapa() {
      if (this.etapa > 1) this.etapa--;
    },

    avancarEtapa1() {
      // Validação básica adicional antes de prosseguir
      if (!this.lead.nome || !this.lead.whatsapp || !this.lead.cidade) return;

      /* 
        Futura integração com Firebase:
        db.collection('leads').add({ ...this.lead, etapa: 1, data: new Date() });
      */

      this.etapa = 2;
    },

    avancarEtapa2() {
      this.etapa = 3;
    },

    selecionarMoto(moto, plano) {
      this.motoSelecionada = moto;
      this.planoSelecionado = plano;

      /* 
        Futura integração com Firebase:
        db.collection('leads').doc(leadId).update({ moto: moto.modelo, plano, etapa: 4 });
      */

      this.etapa = 4;
    },

    formatarMoeda(valor) {
      if (typeof valor !== 'number') return '0,00';
      return valor.toFixed(2).replace('.', ',');
    },

    abrirWhatsApp() {
      const telefone = "5582999679667"; // Seu WhatsApp de atendimento
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
    // Conexão e consumo do arquivo motos.json
    fetch('motos.json')
      .then(response => {
        if (!response.ok) {
          throw new Error(`Erro de rede ao carregar JSON: ${response.status}`);
        }
        return response.json();
      })
      .then(data => {
        // Grava a chave 'catalogo_honda' do JSON na variável reativa do Vue
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