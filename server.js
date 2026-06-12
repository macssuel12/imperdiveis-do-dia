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

app.listen(PORT, () => {
  console.log(`[Servidor] Rodando em http://localhost:${PORT}`);
});
