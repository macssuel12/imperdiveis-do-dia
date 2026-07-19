const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Servir arquivos estáticos do frontend (HTML, CSS, JS) na raiz
app.use(express.static(path.join(__dirname)));

// Rotas explícitas para páginas HTML estáticas (compliance / legais)
app.get('/politica.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'politica.html'));
});

app.get('/termos.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'termos.html'));
});

app.get('/app.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.html'));
});

// Endpoint de Scraping — Sem Playwright (leve, compatível com Render gratuito)
// Mercado Livre: usa API oficial pública (100% confiável)
// Shopee / outros: usa fetch + og:meta tags
app.get('/api/scrape', async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).json({ error: 'URL do produto é obrigatória' });
  }

  console.log(`[Scraper] Extraindo dados para: ${targetUrl}`);

  let title = '';
  let priceNew = 0;
  let priceOld = null;
  let image = '';
  let marketplace = 'generic';

  try {

    // ─────────────────────────────────────────────
    // MERCADO LIVRE — API pública oficial
    // ─────────────────────────────────────────────
    if (targetUrl.includes('mercadolivre.com.br') || targetUrl.includes('mercadolibre.com')) {
      marketplace = 'mercadolivre';

      // Extrai o ID do produto (MLB + dígitos) da URL
      const mlbMatch = targetUrl.match(/MLB-?(\d+)/i);
      if (!mlbMatch) {
        throw new Error('URL do Mercado Livre inválida. Certifique-se de copiar o link direto do produto (deve conter MLB + números).');
      }

      const itemId = 'MLB' + mlbMatch[1];
      console.log(`[ML API] Buscando item: ${itemId}`);

      const apiRes = await fetch(`https://api.mercadolibre.com/items/${itemId}`, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; AchadosBot/1.0)'
        }
      });

      if (!apiRes.ok) {
        throw new Error(`A API do Mercado Livre retornou erro ${apiRes.status}. Verifique se o link do produto está correto.`);
      }

      const data = await apiRes.json();

      title    = data.title || '';
      priceNew = data.price || 0;
      priceOld = data.original_price || null;

      // Pega imagem de maior qualidade disponível
      if (data.pictures && data.pictures.length > 0) {
        image = data.pictures[0].url.replace('-I.jpg', '-O.jpg').replace('-I.webp', '-O.webp');
      } else if (data.thumbnail) {
        image = data.thumbnail.replace('-I.jpg', '-O.jpg');
      }

    // ─────────────────────────────────────────────
    // SHOPEE — fetch + og:meta tags
    // ─────────────────────────────────────────────
    } else if (targetUrl.includes('shopee.com.br') || targetUrl.includes('shope.ee')) {
      marketplace = 'shopee';

      const pageRes = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache'
        },
        redirect: 'follow'
      });

      const html = await pageRes.text();

      // Extrai og:title
      const titleMatch =
        html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/) ||
        html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:title["']/);

      // Extrai og:image
      const imageMatch =
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/) ||
        html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/);

      title = titleMatch ? titleMatch[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").trim() : '';
      image = imageMatch ? imageMatch[1] : '';

      // Tenta encontrar preço no HTML (R$ seguido de valor)
      const priceMatches = html.match(/R\$\s*([\d.]+,[\d]{2})/g);
      if (priceMatches && priceMatches.length > 0) {
        const raw = priceMatches[0].replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
        priceNew = parseFloat(raw) || 0;
        if (priceMatches.length > 1) {
          const rawOld = priceMatches[1].replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
          const possibleOld = parseFloat(rawOld) || 0;
          if (possibleOld > priceNew) priceOld = possibleOld;
        }
      }

    // ─────────────────────────────────────────────
    // GENÉRICO — og:meta tags
    // ─────────────────────────────────────────────
    } else {
      const pageRes = await fetch(targetUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,*/*;q=0.8'
        },
        redirect: 'follow'
      });

      const html = await pageRes.text();

      const titleMatch =
        html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/) ||
        html.match(/<title[^>]*>([^<]+)<\/title>/);

      const imageMatch =
        html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/);

      title = titleMatch ? titleMatch[1].trim() : '';
      image = imageMatch ? imageMatch[1] : '';
    }

    // Validação final
    if (!title || title.trim() === '') {
      throw new Error('Não foi possível extrair o título do produto automaticamente. Por favor, preencha manualmente.');
    }

    console.log(`[Scraper] ✅ Sucesso: ${title.substring(0, 60)}...`);

    return res.json({
      success: true,
      title: title.trim(),
      image: image || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=60',
      priceNew: priceNew || 0,
      priceOld: priceOld,
      marketplace
    });

  } catch (error) {
    console.error('[Erro Scraper]:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message || 'Falha ao processar a página'
    });
  }
});


// Integração com o Banco de Dados do Supabase
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nxxtfvvieosnmfajhdp.supabase.co';
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
