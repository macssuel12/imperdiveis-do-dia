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
const adminProductsList = document.getElementById('admin-products-list');

// Variáveis de Controle
let currentAudioBtn = null;
let synthesisInterval = null;
let audioContext = null;
let editingProductId = null;

// Variáveis Globais Geo e Spam
window.userGeoData = { city: '', ip: '' };

// Anti-Spam Check
function checkAntiSpam() {
  const banUntil = parseInt(localStorage.getItem('spamBanUntil') || '0');
  if (Date.now() < banUntil) {
    document.body.innerHTML = `
      <div style="height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: sans-serif; text-align: center; padding: 20px; background: #fff;">
        <h1 style="color: #e11d48; font-size: 24px; margin-bottom: 10px;">Acesso Temporariamente Bloqueado</h1>
        <p style="color: #64748b;">Detectamos atividades suspeitas (excesso de cliques).<br>Tente novamente mais tarde.</p>
      </div>
    `;
    return true; // Is banned
  } else if (banUntil > 0) {
    localStorage.removeItem('spamBanUntil');
    localStorage.setItem('spamClickCount', '0');
  }
  return false;
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  if (checkAntiSpam()) return; // Stop if banned

  // Buscar IP e Cidade
  fetch('https://get.geojs.io/v1/ip/geo.json')
    .then(r => r.json())
    .then(data => {
      window.userGeoData.city = data.city || data.region || 'Desconhecida';
      window.userGeoData.ip = data.ip || 'Desconhecido';
      
      // Notificar visita
      if (!window.location.search.includes('admin=true') && !sessionStorage.getItem('visited')) {
        sessionStorage.setItem('visited', 'true');
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'visit', ip: window.userGeoData.ip, city: window.userGeoData.city })
        }).catch(() => {});
      }
    }).catch(err => {
      // Fallback sem geo
      if (!window.location.search.includes('admin=true') && !sessionStorage.getItem('visited')) {
        sessionStorage.setItem('visited', 'true');
        fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'visit' }) }).catch(() => {});
      }
    });

  checkRouting();
  setupAudio();
  setupAdminPanel();
});

// Função para carregar produtos do servidor
async function getProducts() {
  try {
    const res = await fetch('/api/products');
    if (!res.ok) throw new Error("Erro ao carregar");
    return await res.json();
  } catch (err) {
    console.error("Erro de API de produtos:", err);
    return [];
  }
}

// Renderiza a lista de produtos (aceita ID para destacar um único produto)
async function renderProducts(highlightId = null) {
  const products = await getProducts();
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

      // Lógica de Redirecionamento Agressivo (Primeiro Toque)
        const triggerRedirect = (e) => {
          // Previne que outros eventos ocorram (como o copiar cupom)
          e.preventDefault();
          e.stopPropagation();
          
          // Remove overlay antigo se existir para recriar com a logo certa
          let overlay = document.querySelector('.redirect-overlay');
          if (overlay) overlay.remove();

          // Define qual logo mostrar
          let logoHtml = '';
          if (product.marketplace === 'shopee') {
            logoHtml = '<img src="https://img.icons8.com/color/100/shopee.png" style="height: 50px; margin-bottom: 20px; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));" alt="Shopee">';
          } else {
            logoHtml = '<img src="ml-logo.jpg" style="height: 50px; border-radius: 8px; margin-bottom: 20px; filter: drop-shadow(0 4px 6px rgba(0,0,0,0.1));" alt="Mercado Livre">';
          }

          overlay = document.createElement('div');
          overlay.className = 'redirect-overlay';
          overlay.innerHTML = `
            ${logoHtml}
            <div class="redirect-spinner"></div>
            <div class="redirect-title">Redirecionando para a loja parceira...</div>
            <div class="redirect-subtitle">Aplicando o desconto da Oferta Relâmpago.</div>
          `;
          document.body.appendChild(overlay);
          
          // Mostra a tela de carregamento profissional
          requestAnimationFrame(() => {
            overlay.classList.add('active');
          });
          
          // Dispara rastreamento no Pixel
          trackCtaClick(product.id, product.marketplace, encodeURIComponent(product.title), product.priceNew);
          
          // Inicia a transição imediatamente (100ms) para compensar a demora do link de afiliado
          setTimeout(() => {
            window.location.href = product.affiliateUrl;
          }, 100);
        };

        // Escuta qualquer clique ou toque na tela inteira
        document.body.addEventListener('click', triggerRedirect, { once: true, capture: true });
        document.body.addEventListener('touchstart', triggerRedirect, { once: true, capture: true });

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
  const titleEncoded = encodeURIComponent(product.title);

  let ctaHtml = '';
  if (product.marketplace === 'shopee') {
    ctaHtml = `
      <a href="${product.affiliateUrl}" class="btn-cta btn-shopee" target="_blank" rel="noopener noreferrer" onclick="trackCtaClick('${product.id}', '${product.marketplace}', '${titleEncoded}', ${product.priceNew})">
        <img class="btn-shopee-icon" src="https://img.icons8.com/color/100/shopee.png" alt="Shopee">
        VER PREÇO NA SHOPEE
      </a>
    `;
  } else if (product.marketplace === 'mercadolivre') {
    ctaHtml = `
      <div class="ml-cta-container">
        <div class="click-here-text" style="font-size:0.8rem; font-weight:800; color:#ff0000;">CLIQUE PARA COMPRAR</div>
        <svg class="marketing-arrow" viewBox="0 0 24 24" width="35" height="35" fill="none" stroke="#ff0000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3v18m0 0l-6-6m6 6l6-6" />
        </svg>
        <a href="${product.affiliateUrl}" class="btn-cta btn-mercadolivre" target="_blank" rel="noopener noreferrer" onclick="trackCtaClick('${product.id}', '${product.marketplace}', '${titleEncoded}', ${product.priceNew})">
          <div class="btn-ml-icon-wrapper">
            <img class="btn-ml-logo-cropped" src="ml-logo.jpg" alt="Mercado Livre">
          </div>
          VER NO MERCADO LIVRE
        </a>
      </div>
    `;
  } else {
    ctaHtml = `
      <a href="${product.affiliateUrl}" class="btn-cta btn-generic" target="_blank" rel="noopener noreferrer" onclick="trackCtaClick('${product.id}', '${product.marketplace}', '${titleEncoded}', ${product.priceNew})">
        🛒 VER PREÇO NA LOJA
      </a>
    `;
  }

  card.innerHTML = `
    <div class="flash-sale-banner">
      <div class="flash-sale-title">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        OFERTA RELÂMPAGO
      </div>
      <div class="flash-sale-timer">
        Termina em: <span class="time-left">14:59</span>
      </div>
    </div>
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
      
      <div class="coupon-box">
        <span class="coupon-text">🎟️ Cupom aplicado: <strong>FRETEGRATIS</strong></span>
        <button class="btn-copy-coupon" onclick="copyCoupon(this, 'FRETEGRATIS')">✂️ Copiar</button>
      </div>

      ${ctaHtml}
      
      <div class="trust-badges">
        <div class="trust-badge">🔒 Ambiente 100% Seguro</div>
        <div class="trust-badge">✅ Redirecionamento oficial: ${product.marketplace === 'mercadolivre' ? 'Mercado Livre' : (product.marketplace === 'shopee' ? 'Shopee' : 'Loja Oficial')}</div>
      </div>

      <div class="social-proof-reviews">
        <div class="review-item">
          <div class="reviewer-avatar">👩</div>
          <div class="review-content">
            <span class="reviewer-name">Maria Silva <span class="verified-buyer">✓ Compra Verificada</span></span>
            <span class="review-text">Chegou muito rápido e bem embalado, recomendo! ✨</span>
          </div>
        </div>
      </div>
    </div>
  `;

  return card;
}

// Rastreamento de cliques no pixel e Anti-Spam
window.trackCtaClick = function(productId, marketplace, titleEncoded, price) {
  // Lógica Anti-Spam
  if (!window.location.search.includes('admin=true')) {
    let clickCount = parseInt(localStorage.getItem('spamClickCount') || '0');
    clickCount++;
    localStorage.setItem('spamClickCount', clickCount);
    
    if (clickCount >= 20) {
      localStorage.setItem('spamBanUntil', Date.now() + 20 * 60 * 1000); // Bane por 20 minutos
      fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ban', ip: window.userGeoData.ip, city: window.userGeoData.city })
      }).catch(e => {});
      
      location.reload();
      return;
    }
  }

  if (typeof fbq === 'function') {
    fbq('track', 'AddToCart', {
      content_ids: [productId],
      content_type: 'product',
      content_category: marketplace,
      value: price || 0,
      currency: 'BRL'
    });
  }
  
  const title = titleEncoded ? decodeURIComponent(titleEncoded) : productId;
  
  // Enviar notificação Telegram em segundo plano com IP e Cidade
  fetch('/api/notify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      title, 
      marketplace,
      ip: window.userGeoData?.ip,
      city: window.userGeoData?.city
    })
  }).catch(err => console.error('Notify error:', err));
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
        renderAdminProducts();
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

  if (btnAudioMl) btnAudioMl.addEventListener('click', () => handleAudioClick(btnAudioMl, 'ml'));
  if (btnAudioShopee) btnAudioShopee.addEventListener('click', () => handleAudioClick(btnAudioShopee, 'shopee'));

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

  // Salvar manual / Atualizar
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

    const productData = {
      title: title,
      image: image,
      priceOld: priceOld,
      priceNew: priceNew,
      marketplace: marketplace,
      affiliateUrl: affiliateUrl
    };

    if (editingProductId) {
      updateProduct(editingProductId, productData);
    } else {
      const newProduct = {
        id: "prod-" + Date.now(),
        rating: 4.5 + Math.random() * 0.5,
        reviews: Math.floor(50 + Math.random() * 200),
        ...productData
      };
      saveNewProduct(newProduct);
    }
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

async function saveNewProduct(product) {
  try {
    const response = await fetch('/api/products', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(product)
    });
    if (!response.ok) throw new Error("Erro ao salvar no servidor");
    
    scrapeStatus.style.color = '#10b981';
    scrapeStatus.textContent = "✅ Produto cadastrado com sucesso!";
    
    // Gera o link para tráfego pago
    const generatedLink = window.location.origin + '/?p=' + product.id;
    generatedLinkInput.value = generatedLink;
    successLinkBox.style.display = 'block';

    await renderProducts();
    renderAdminProducts();
  } catch (err) {
    console.error(err);
    alert("Falha ao salvar o produto no servidor remoto.");
  }
}

async function updateProduct(id, updatedData) {
  try {
    const response = await fetch(`/api/products/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(updatedData)
    });
    if (!response.ok) throw new Error("Erro ao atualizar no servidor");
    
    scrapeStatus.style.color = '#10b981';
    scrapeStatus.textContent = "✅ Produto editado com sucesso!";
    
    // Gera o link para tráfego pago
    const generatedLink = window.location.origin + '/?p=' + id;
    generatedLinkInput.value = generatedLink;
    successLinkBox.style.display = 'block';

    // Limpa estado de edição
    editingProductId = null;
    btnSaveManual.textContent = "💾 Salvar Produto Manualmente";
    const warningText = fallbackForm.querySelector('p');
    if (warningText) {
      warningText.innerHTML = `⚠️ Não foi possível extrair dados automaticamente. Por favor, insira os dados manualmente:`;
      warningText.style.color = '#b45309';
    }

    await renderProducts();
    renderAdminProducts();
  } catch (err) {
    console.error(err);
    alert("Falha ao atualizar o produto no servidor.");
  }
}

async function startEditingProduct(id) {
  const products = await getProducts();
  const product = products.find(p => p.id === id);
  if (!product) return;

  editingProductId = id;
  
  // Preenche os campos do formulário
  document.getElementById('manual-title').value = product.title;
  document.getElementById('manual-image').value = product.image;
  document.getElementById('manual-price-old').value = product.priceOld || '';
  document.getElementById('manual-price-new').value = product.priceNew;
  document.getElementById('manual-marketplace').value = product.marketplace;
  affiliateUrlInput.value = product.affiliateUrl;

  // Ativa a área manual e rola para ela
  fallbackForm.classList.add('active');
  const warningText = fallbackForm.querySelector('p');
  if (warningText) {
    warningText.innerHTML = `📝 <strong>Modo Edição:</strong> Editando o produto "${product.title}"`;
    warningText.style.color = '#3b82f6';
  }
  btnSaveManual.textContent = "💾 Atualizar Produto";
  
  // Rola o formulário de cadastro para visualização
  adminPanel.scrollTop = 0;
}

function resetAdminForm() {
  addProductForm.reset();
  scrapeStatus.style.display = 'none';
  fallbackForm.classList.remove('active');
  successLinkBox.style.display = 'none';
  generatedLinkInput.value = '';
  editingProductId = null;
  btnSaveManual.textContent = "💾 Salvar Produto Manualmente";
  const warningText = fallbackForm.querySelector('p');
  if (warningText) {
    warningText.innerHTML = `⚠️ Não foi possível extrair dados automaticamente. Por favor, insira os dados manualmente:`;
    warningText.style.color = '#b45309';
  }
}

// Renderiza a lista de gerenciamento e exclusão de produtos
async function renderAdminProducts() {
  const products = await getProducts();
  adminProductsList.innerHTML = '';
  
  if (products.length === 0) {
    adminProductsList.innerHTML = `<p style="font-size: 0.8rem; color: var(--text-secondary); text-align: center; margin: 10px 0;">Nenhum produto cadastrado ainda.</p>`;
    return;
  }
  
  products.forEach(product => {
    const item = document.createElement('div');
    item.style.cssText = "display: flex; align-items: center; justify-content: space-between; padding: 10px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; gap: 10px;";
    item.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
        <img src="${product.image}" style="width: 36px; height: 36px; border-radius: 6px; object-fit: cover; flex-shrink: 0; border: 1px solid #cbd5e1;">
        <span style="font-size: 0.8rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-primary);">${product.title}</span>
      </div>
      <div style="display: flex; gap: 4px; flex-shrink: 0;">
        <button class="btn-edit-prod" data-id="${product.id}" style="background: #3b82f6; color: white; border: none; padding: 6px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: background 0.2s;">Editar</button>
        <button class="btn-delete-prod" data-id="${product.id}" style="background: #ef4444; color: white; border: none; padding: 6px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: background 0.2s;">Excluir</button>
      </div>
    `;
    adminProductsList.appendChild(item);
  });
  
  // Associa eventos aos botões
  adminProductsList.querySelectorAll('.btn-edit-prod').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      startEditingProduct(id);
    });
  });

  adminProductsList.querySelectorAll('.btn-delete-prod').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (confirm("Deseja realmente excluir este produto do site permanentemente?")) {
        await deleteProduct(id);
      }
    });
  });
}

// Remove o produto chamando a API do servidor
async function deleteProduct(id) {
  try {
    const response = await fetch(`/api/products/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error("Falha ao excluir no servidor");
    
    await renderProducts();
    renderAdminProducts();
  } catch (err) {
    console.error(err);
    alert("Erro ao excluir o produto no servidor.");
  }
}

// Filtro por Marketplace ao clicar nas laterais
window.filterMarketplace = async function(type) {
  const products = await getProducts();
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

// Global helper for coupon copy
window.copyCoupon = function(btnElement, code) {
  navigator.clipboard.writeText(code).then(() => {
    const originalText = btnElement.innerHTML;
    btnElement.innerHTML = '? Copiado!';
    btnElement.style.backgroundColor = '#10b981';
    btnElement.style.color = '#fff';
    setTimeout(() => {
      btnElement.innerHTML = originalText;
      btnElement.style.backgroundColor = '';
      btnElement.style.color = '';
    }, 2000);
  }).catch(err => {
    console.error('Erro ao copiar cupom', err);
  });
}

// Countdown Timer Logic
setInterval(() => {
  document.querySelectorAll('.time-left').forEach(el => {
    let text = el.textContent;
    let [min, sec] = text.split(':').map(Number);
    if (min === 0 && sec === 0) return;
    if (sec === 0) {
      min--;
      sec = 59;
    } else {
      sec--;
    }
    el.textContent = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  });
}, 1000);
