// Configurações e Produtos Iniciais
const INITIAL_PRODUCTS = [];

// Caminhos dos arquivos de áudio locais (basta colocar os arquivos .mp3 na pasta do projeto)
const AUDIO_PATHS = {
  ml: 'mercadolivre.mp3',
  shopee: 'shopee.mp3'
};

// Elementos do DOM
const feedContainer = document.getElementById('products-feed');
const highlightMsg = document.getElementById('highlight-msg');
const btnShowAll = document.getElementById('btn-show-all');
const gridTitle = document.getElementById('grid-title');
const globalAudio = document.getElementById('global-audio-player');
const btnAudioMl = document.getElementById('btn-audio-ml');
const btnAudioShopee = document.getElementById('btn-audio-shopee');
const adminPanel = document.getElementById('admin-panel');
const adminCloseBtn = document.getElementById('admin-close-btn');
const addProductForm = document.getElementById('add-product-form');
const cleanUrlInput = document.getElementById('clean-url');
const affiliateUrlInput = document.getElementById('affiliate-url');
const scrapeStatus = document.getElementById('scrape-status');
const fallbackForm = document.getElementById('fallback-manual-form');
const btnSaveManual = document.getElementById('btn-save-manual');
const successLinkBox = document.getElementById('success-link-box');
const generatedLinkInput = document.getElementById('generated-link-input');
const btnCopyLink = document.getElementById('btn-copy-link');

// Variáveis de Controle
let currentAudioBtn = null;
let synthesisInterval = null;
let audioContext = null;

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  initProducts();
  checkRouting();
  setupAudio();
  setupAdminPanel();
});

// Inicializa produtos no LocalStorage
function initProducts() {
  const products = localStorage.getItem('achadinhos_products');
  if (!products) {
    localStorage.setItem('achadinhos_products', JSON.stringify(INITIAL_PRODUCTS));
  } else {
    // Remove os produtos de amostra do cache local do navegador para manter apenas os reais (Creatina, etc.)
    try {
      const list = JSON.parse(products);
      const sampleIds = ["jbl-wave-buds", "amazfit-bip-5", "airfryer-mondial"];
      const filtered = list.filter(p => !sampleIds.includes(p.id));
      if (list.length !== filtered.length) {
        localStorage.setItem('achadinhos_products', JSON.stringify(filtered));
      }
    } catch (e) {
      console.error("Erro ao migrar cache local:", e);
    }
  }
}

// Retorna todos os produtos ativos
function getProducts() {
  return JSON.parse(localStorage.getItem('achadinhos_products')) || INITIAL_PRODUCTS;
}

// Renderiza a lista de produtos (aceita ID para destacar um único produto)
function renderProducts(highlightId = null) {
  const products = getProducts();
  feedContainer.innerHTML = '';

  if (highlightId) {
    // Modo Produto Único (Meta Ads Bridge Page)
    const product = products.find(p => p.id === highlightId);
    if (product) {
      document.body.classList.add('highlight-mode');
      highlightMsg.style.display = 'flex';
      btnShowAll.style.display = 'block';
      
      const card = createProductCard(product, true);
      feedContainer.appendChild(card);
      
      // Envia evento de visualização do produto para o pixel se configurado
      if (typeof fbq === 'function') {
        fbq('track', 'ViewContent', {
          content_name: product.title,
          content_ids: [product.id],
          content_type: 'product',
          value: product.priceNew,
          currency: 'BRL'
        });
      }
      return;
    }
  }

  // Modo Catálogo Completo
  document.body.classList.remove('highlight-mode');
  highlightMsg.style.display = 'none';
  btnShowAll.style.display = 'none';
  gridTitle.textContent = "🔥 Ofertas Recomendadas";

  products.forEach(product => {
    const card = createProductCard(product, false);
    feedContainer.appendChild(card);
  });
}

// Cria a estrutura HTML de um Card
function createProductCard(product, isFocused) {
  const card = document.createElement('div');
  card.className = `product-card ${isFocused ? 'focused' : ''}`;
  card.id = `card-${product.id}`;

  const formattedOldPrice = product.priceOld ? `De: R$ ${product.priceOld.toFixed(2).replace('.', ',')}` : '';
  const formattedNewPrice = product.priceNew.toFixed(2).replace('.', ',');

  let ctaHtml = '';
  if (product.marketplace === 'shopee') {
    ctaHtml = `
      <a href="${product.affiliateUrl}" class="btn-cta btn-shopee" target="_blank" rel="noopener noreferrer" onclick="trackCtaClick('${product.id}', '${product.marketplace}')">
        <img class="btn-shopee-icon" src="https://img.icons8.com/color/100/shopee.png" alt="Shopee">
        VER PREÇO NA SHOPEE
      </a>
    `;
  } else if (product.marketplace === 'mercadolivre') {
    ctaHtml = `
      <a href="${product.affiliateUrl}" class="btn-cta btn-mercadolivre" target="_blank" rel="noopener noreferrer" onclick="trackCtaClick('${product.id}', '${product.marketplace}')">
        <div class="btn-ml-icon-wrapper">
          <img class="btn-ml-logo-cropped" src="ml-logo.jpg" alt="Mercado Livre">
        </div>
        VER NO MERCADO LIVRE
      </a>
    `;
  } else {
    ctaHtml = `
      <a href="${product.affiliateUrl}" class="btn-cta btn-generic" target="_blank" rel="noopener noreferrer" onclick="trackCtaClick('${product.id}', '${product.marketplace}')">
        🛒 VER PREÇO NA LOJA
      </a>
    `;
  }

  card.innerHTML = `
    <div class="img-container">
      <img src="${product.image}" alt="${product.title}" loading="lazy">
    </div>
    <div class="card-info">
      <h3 class="product-title">${product.title}</h3>
      <div class="rating-container">
        <span class="stars">⭐⭐⭐⭐⭐</span>
        <span>${product.rating.toFixed(1)} (${product.reviews} avaliações)</span>
      </div>
      <div class="price-box">
        ${formattedOldPrice ? `<span class="price-old">${formattedOldPrice}</span>` : ''}
        <span class="price-new"><span>Por apenas:</span> R$ ${formattedNewPrice}</span>
      </div>
      ${ctaHtml}
    </div>
  `;

  return card;
}

// Rastreamento de cliques no pixel
window.trackCtaClick = function(productId, marketplace) {
  if (typeof fbq === 'function') {
    fbq('track', 'AddToCart', {
      content_ids: [productId],
      content_type: 'product',
      content_category: marketplace
    });
  }
};

// Roteamento dinâmico
function checkRouting() {
  const params = new URLSearchParams(window.location.search);
  const productParam = params.get('p') || params.get('produto');
  const hashParam = window.location.hash ? window.location.hash.substring(1) : null;
  
  // Verifica se o usuário está tentando acessar o painel administrativo (?admin=true ou #admin)
  const isAdminRequest = params.get('admin') === 'true' || params.get('p') === 'admin' || hashParam === 'admin';
  
  if (isAdminRequest) {
    // Limpa o parâmetro da URL visualmente para manter a discrição e evitar loops no prompt
    const cleanUrlPath = window.location.pathname;
    window.history.replaceState({}, '', cleanUrlPath);
    
    // Solicita a senha
    setTimeout(() => {
      const password = prompt("Digite a senha de acesso ao Painel:");
      if (password === "201510,ma") {
        adminPanel.classList.add('active');
      } else {
        alert("Senha incorreta!");
      }
      renderProducts();
    }, 100);
    return;
  }

  const targetId = productParam || hashParam;

  if (targetId) {
    renderProducts(targetId);
  } else {
    renderProducts();
  }
}

// Recarrega a página ao clicar para ver todos os produtos
btnShowAll.addEventListener('click', (e) => {
  e.preventDefault();
  window.history.pushState({}, '', window.location.pathname);
  checkRouting();
});

// Ouvir alterações na URL (ex: botões voltar)
window.addEventListener('popstate', checkRouting);
window.addEventListener('hashchange', checkRouting);

// Controle da Seção de Áudios (Stories)
function setupAudio() {
  // Inicialização do Web Audio API para simulação (se os links mp3 falharem ou demorarem a carregar)
  const initWebAudio = () => {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
  };

  const handleAudioClick = (btn, type) => {
    initWebAudio();
    
    // Se o mesmo áudio estiver tocando, pausa
    if (btn.classList.contains('playing')) {
      stopAllAudio();
      return;
    }

    stopAllAudio();

    // Ativa animações
    btn.classList.add('playing');
    currentAudioBtn = btn;

    // Tenta reproduzir o arquivo de áudio real com cache buster para forçar a atualização
    globalAudio.src = AUDIO_PATHS[type] + '?v=' + Date.now();
    globalAudio.play()
      .then(() => {
        // Áudio carregado e tocando
      })
      .catch(err => {
        console.warn("Áudio local não encontrado ou sem interação prévia. Iniciando sintetizador de demonstração...", err);
        playSyntheticBeepPattern();
      });
  };

  btnAudioMl.addEventListener('click', () => handleAudioClick(btnAudioMl, 'ml'));
  btnAudioShopee.addEventListener('click', () => handleAudioClick(btnAudioShopee, 'shopee'));

  globalAudio.addEventListener('ended', stopAllAudio);
}

function stopAllAudio() {
  globalAudio.pause();
  globalAudio.src = '';
  
  if (currentAudioBtn) {
    currentAudioBtn.classList.remove('playing');
    currentAudioBtn = null;
  }

  if (synthesisInterval) {
    clearInterval(synthesisInterval);
    synthesisInterval = null;
  }
}

// Gera tons sonoros eletrônicos para simular um podcast/mensagem de áudio se o arquivo mp3 não existir
function playSyntheticBeepPattern() {
  if (!audioContext) return;
  
  let count = 0;
  synthesisInterval = setInterval(() => {
    if (count > 15) { // Para depois de 15 segundos
      stopAllAudio();
      return;
    }
    
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    // Altera frequências para simular conversa
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150 + Math.random() * 200, audioContext.currentTime);
    
    gain.gain.setValueAtTime(0.1, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
    
    osc.start();
    osc.stop(audioContext.currentTime + 0.5);
    count++;
  }, 600);
}

// Painel Administrativo / Scraping Seguro
function setupAdminPanel() {

  adminCloseBtn.addEventListener('click', () => {
    adminPanel.classList.remove('active');
    resetAdminForm();
  });

  addProductForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cleanUrl = cleanUrlInput.value.trim();
    const affiliateUrl = affiliateUrlInput.value.trim();

    scrapeStatus.style.display = 'block';
    scrapeStatus.style.color = '#3b82f6';
    scrapeStatus.textContent = "🔍 Robô de Scraping iniciado no Back-end com Playwright...";

    try {
      // Faz requisição para a nossa API Node
      const response = await fetch(`/api/scrape?url=${encodeURIComponent(cleanUrl)}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Erro ao obter dados da API');
      }

      // Prepara e salva o produto retornado com sucesso
      const newProduct = {
        id: "prod-" + Date.now(),
        title: data.title,
        image: data.image,
        rating: 4.6 + Math.random() * 0.4,
        reviews: Math.floor(120 + Math.random() * 400),
        priceOld: data.priceOld,
        priceNew: data.priceNew,
        marketplace: data.marketplace,
        affiliateUrl: affiliateUrl
      };

      saveNewProduct(newProduct);
      scrapeStatus.style.color = '#10b981';
      scrapeStatus.textContent = "✅ Dados extraídos e produto cadastrado com sucesso!";
      
      // Gera o link para tráfego pago
      const generatedLink = window.location.origin + '/?p=' + newProduct.id;
      generatedLinkInput.value = generatedLink;
      successLinkBox.style.display = 'block';

    } catch (error) {
      console.error('[Erro Scraping]:', error);
      scrapeStatus.style.color = '#d97706';
      scrapeStatus.textContent = `⚠️ Falha ao extrair dados automaticamente: ${error.message || 'CORS ou erro de seletores'}. Preencha manualmente abaixo:`;
      fallbackForm.classList.add('active');
    }
  });

  // Salvar manual
  btnSaveManual.addEventListener('click', () => {
    const title = document.getElementById('manual-title').value.trim();
    const image = document.getElementById('manual-image').value.trim() || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=60';
    const priceOld = parseFloat(document.getElementById('manual-price-old').value) || null;
    const priceNew = parseFloat(document.getElementById('manual-price-new').value);
    const marketplace = document.getElementById('manual-marketplace').value;
    const affiliateUrl = affiliateUrlInput.value.trim();

    if (!title || !priceNew) {
      alert("Por favor, preencha pelo menos o Título e o Preço Promocional.");
      return;
    }

    const newProduct = {
      id: "prod-" + Date.now(),
      title: title,
      image: image,
      rating: 4.5 + Math.random() * 0.5,
      reviews: Math.floor(50 + Math.random() * 200),
      priceOld: priceOld,
      priceNew: priceNew,
      marketplace: marketplace,
      affiliateUrl: affiliateUrl
    };

    saveNewProduct(newProduct);
    
    scrapeStatus.style.color = '#10b981';
    scrapeStatus.textContent = "✅ Produto cadastrado manualmente com sucesso!";
    
    // Gera o link para tráfego pago
    const generatedLink = window.location.origin + '/?p=' + newProduct.id;
    generatedLinkInput.value = generatedLink;
    successLinkBox.style.display = 'block';
  });

  // Evento de copiar o link do tráfego pago
  btnCopyLink.addEventListener('click', () => {
    generatedLinkInput.select();
    generatedLinkInput.setSelectionRange(0, 99999); // Para mobile
    navigator.clipboard.writeText(generatedLinkInput.value)
      .then(() => {
        const originalText = btnCopyLink.textContent;
        btnCopyLink.textContent = "Copiado! ✓";
        btnCopyLink.style.background = "#059669";
        setTimeout(() => {
          btnCopyLink.textContent = originalText;
          btnCopyLink.style.background = "#10b981";
        }, 2000);
      })
      .catch(err => {
        console.error("Erro ao copiar link:", err);
      });
  });
}

function saveNewProduct(product) {
  const products = getProducts();
  products.unshift(product); // Adiciona no início da lista
  localStorage.setItem('achadinhos_products', JSON.stringify(products));
  checkRouting();
}

function resetAdminForm() {
  addProductForm.reset();
  scrapeStatus.style.display = 'none';
  fallbackForm.classList.remove('active');
  successLinkBox.style.display = 'none';
  generatedLinkInput.value = '';
}

// Filtro por Marketplace ao clicar nas laterais
window.filterMarketplace = function(type) {
  const products = getProducts();
  const filtered = products.filter(p => p.marketplace === type);
  
  feedContainer.innerHTML = '';
  
  if (filtered.length === 0) {
    feedContainer.innerHTML = `<p style="text-align: center; color: var(--text-secondary); font-weight: 500; margin: 40px 0;">Nenhum produto cadastrado para esta plataforma ainda.</p>`;
  } else {
    filtered.forEach(product => {
      const card = createProductCard(product, false);
      feedContainer.appendChild(card);
    });
  }
  
  gridTitle.textContent = `🔥 Achadinhos Recomendados: ${type === 'shopee' ? 'Shopee' : 'Mercado Livre'}`;
  btnShowAll.style.display = 'block';
  
  // Rolar suavemente para o início da lista
  feedContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
