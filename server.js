const express = require('express');
const cors = require('cors');
const { chromium } = require('playwright');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Servir arquivos estáticos do frontend (HTML, CSS, JS) na raiz
app.use(express.static(path.join(__dirname)));

// Endpoint de Scraping com Playwright
app.get('/api/scrape', async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).json({ error: 'URL do produto é obrigatória' });
  }

  console.log(`[Robô] Iniciando extração para: ${targetUrl}`);
  let browser;

  try {
    // Inicializa o Playwright usando navegador Chromium headless
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled'
      ]
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();
    
    // Configura tempo limite de navegação curto para otimizar velocidade
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

    let title = '';
    let priceNew = 0;
    let priceOld = null;
    let image = '';
    let marketplace = 'generic';

    if (targetUrl.includes('mercadolivre.com.br') || targetUrl.includes('mercadolibre.com')) {
      marketplace = 'mercadolivre';
      
      // Extrair dados do Mercado Livre
      title = await page.locator('h1.ui-pdp-title').first().innerText().catch(() => '');
      
      // Tenta imagem do Mercado Livre
      image = await page.locator('img.ui-pdp-image.ui-pdp-gallery__figure__image').first().getAttribute('src').catch(() => '');
      if (!image) {
        image = await page.locator('img.ui-pdp-image').first().getAttribute('src').catch(() => '');
      }

      // Tenta extrair preço promocional
      const priceText = await page.locator('.ui-pdp-price__part--medium .andes-money-amount__fraction').first().innerText().catch(() => '');
      const centsText = await page.locator('.ui-pdp-price__part--medium .andes-money-amount__cents').first().innerText().catch(() => '00');
      
      if (priceText) {
        priceNew = parseFloat(priceText.replace(/\./g, '').replace(',', '.')) + (parseFloat(centsText) / 100);
      }

      // Preço antigo
      const oldPriceText = await page.locator('.ui-pdp-price__part--small .andes-money-amount__fraction').first().innerText().catch(() => '');
      if (oldPriceText) {
        priceOld = parseFloat(oldPriceText.replace(/\./g, '').replace(',', '.'));
      }

    } else if (targetUrl.includes('shopee.com.br')) {
      marketplace = 'shopee';

      // Aguarda um curto espaço para renderização de scripts da Shopee
      await page.waitForTimeout(2000);

      // Tenta múltiplos seletores comuns de título da Shopee
      title = await page.locator('div.V2JnSS span').first().innerText()
        .catch(async () => await page.locator('.EFPT-g').first().innerText())
        .catch(async () => await page.title())
        .catch(() => '');

      // Imagem do produto
      image = await page.locator('div.p\\+3u1m img').first().getAttribute('src')
        .catch(async () => await page.locator('div.flex-shrink-0 img').first().getAttribute('src'))
        .catch(async () => await page.locator('img').first().getAttribute('src'))
        .catch(() => '');

      // Preço da Shopee
      const rawPrice = await page.locator('div.PQmLw1').first().innerText()
        .catch(async () => await page.locator('div._3n55aS').first().innerText())
        .catch(() => '');

      if (rawPrice) {
        const cleanedPrice = rawPrice.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
        priceNew = parseFloat(cleanedPrice) || 0;
      }
    } else {
      // Outro site genérico
      title = await page.title().catch(() => 'Produto sem título');
      image = await page.locator('img').first().getAttribute('src').catch(() => '');
    }

    await browser.close();

    // Sanitização e Fallbacks caso venham vazios
    if (!title || title.trim() === '') {
      throw new Error('Não foi possível extrair dados estruturados da página automaticamente');
    }

    return res.json({
      success: true,
      title: title.trim(),
      image: image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=60',
      priceNew: priceNew || 99.90,
      priceOld: priceOld,
      marketplace
    });

  } catch (error) {
    console.error('[Erro Robô]:', error.message);
    if (browser) await browser.close();
    return res.status(500).json({ 
      success: false, 
      error: error.message || 'Falha ao processar a página com Playwright' 
    });
  }
});

// Integração com o Banco de Dados do Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nxxtfvvieosonmfajhdp.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_tr1tJzD83vyq3HkXyevJAQ_XMaKquyE';

app.get('/api/products', async (req, res) => {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/products?select=*&order=created_at.desc`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    if (!response.ok) {
      throw new Error(`Erro Supabase: ${response.statusText}`);
    }

    const data = await response.json();
    
    // Mapeia colunas snake_case para propriedades camelCase esperadas no frontend
    const products = data.map(p => ({
      id: p.id,
      title: p.title,
      image: p.image,
      rating: p.rating ? parseFloat(p.rating) : 5.0,
      reviews: p.reviews ? parseInt(p.reviews, 10) : 100,
      priceOld: p.price_old ? parseFloat(p.price_old) : null,
      priceNew: p.price_new ? parseFloat(p.price_new) : 0,
      marketplace: p.marketplace,
      affiliateUrl: p.affiliate_url
    }));

    res.json(products);
  } catch (err) {
    console.error('Erro ao buscar produtos do Supabase:', err);
    res.status(500).json({ error: 'Erro ao carregar produtos do banco de dados' });
  }
});

app.post('/api/products', async (req, res) => {
  const newProduct = req.body;
  if (!newProduct || !newProduct.id || !newProduct.title) {
    return res.status(400).json({ error: 'Dados de produto inválidos' });
  }

  try {
    // Mapeia propriedades camelCase para colunas snake_case do Supabase
    const dbProduct = {
      id: newProduct.id,
      title: newProduct.title,
      image: newProduct.image,
      rating: newProduct.rating,
      reviews: newProduct.reviews,
      price_old: newProduct.priceOld,
      price_new: newProduct.priceNew,
      marketplace: newProduct.marketplace,
      affiliate_url: newProduct.affiliateUrl
    };

    const response = await fetch(`${SUPABASE_URL}/rest/v1/products`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(dbProduct)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erro Supabase POST: ${errText}`);
    }

    res.json({ success: true, product: newProduct });
  } catch (err) {
    console.error('Erro ao salvar produto no Supabase:', err);
    res.status(500).json({ error: 'Erro ao salvar produto no banco de dados' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  const id = req.params.id;

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}`, {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`
      }
    });

    if (!response.ok) {
      throw new Error(`Erro Supabase DELETE: ${response.statusText}`);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao excluir produto no Supabase:', err);
    res.status(500).json({ error: 'Erro ao excluir produto do banco de dados' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  const id = req.params.id;
  const updatedData = req.body;

  try {
    const dbUpdate = {};
    if (updatedData.title !== undefined) dbUpdate.title = updatedData.title;
    if (updatedData.image !== undefined) dbUpdate.image = updatedData.image;
    if (updatedData.priceOld !== undefined) dbUpdate.price_old = updatedData.priceOld;
    if (updatedData.priceNew !== undefined) dbUpdate.price_new = updatedData.priceNew;
    if (updatedData.marketplace !== undefined) dbUpdate.marketplace = updatedData.marketplace;
    if (updatedData.affiliateUrl !== undefined) dbUpdate.affiliate_url = updatedData.affiliateUrl;

    const response = await fetch(`${SUPABASE_URL}/rest/v1/products?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(dbUpdate)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erro Supabase PATCH: ${errText}`);
    }

    res.json({ success: true, product: updatedData });
  } catch (err) {
    console.error('Erro ao atualizar produto no Supabase:', err);
    res.status(500).json({ error: 'Erro ao atualizar produto no banco de dados' });
  }
});

app.post('/api/notify', async (req, res) => {
  const { type, title, marketplace, ip, city } = req.body;
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
  
  let text = '';
  const geoInfo = (city || ip) ? `\n📍 *Local:* ${city || 'Desconhecida'} (IP: ${ip || 'Desconhecido'})` : '';
  
  if (type === 'visit') {
    text = `👀 *Novo Visitante!*\nAlguém acabou de entrar no seu site.${geoInfo}`;
  } else {
    if (!title && type !== 'ban' && type !== 'app_install') return res.status(400).json({ error: 'Title is required' });
    
    if (type === 'ban') {
       text = `🚫 *Bloqueio Anti-Spam!*\nAlguém tentou clicar mais de 20 vezes e foi banido por 20 minutos.${geoInfo}`;
    } else if (type === 'app_install') {
       text = `📲 *Novo Download!*\nAlguém clicou para baixar o App ShapePro Fitness.${geoInfo}`;
    } else {
       text = `🔔 *Novo Clique!*\n\n📦 *Produto:* ${title}\n🛒 *Loja:* ${marketplace || 'Não especificada'}${geoInfo}`;
    }
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: text,
        parse_mode: 'Markdown'
      })
    });
    
    if (!response.ok) {
      console.error('Telegram API Error:', await response.text());
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Erro ao enviar notificacao telegram:', err);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

app.listen(PORT, () => {
  console.log(`[Servidor] Rodando em http://localhost:${PORT}`);
});
