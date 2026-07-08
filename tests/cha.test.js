// Playwright tests — Chá da Antonella
// Supabase mockado via page.route — nenhuma chamada real ao banco.

const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');

// ─── Dados mock ────────────────────────────────────────────────────────────────
const MOCK_ITENS = [
  { id: 1, categoria: 'Higiene e fraldas', nome: 'Fralda RN', emoji: '🧴', preco: 70, tag: 'essencial', ordem: 1, is_cota: false, cota_valor: null, cotas_total: null, imagem_url: null },
  { id: 2, categoria: 'Alimentação', nome: 'Mamadeira', emoji: '🍼', preco: 100, tag: 'essencial', ordem: 2, is_cota: false, cota_valor: null, cotas_total: null, imagem_url: null },
  { id: 3, categoria: 'Presentes maiores', nome: 'Carrinho', emoji: '🚗', preco: 2000, tag: 'luxo', ordem: 3, is_cota: true, cota_valor: 50, cotas_total: 10, imagem_url: null },
];
const MOCK_COTAS = [
  { item_id: 3, cotas_total: 10, cotas_reservadas: 7 },
];
const MOCK_CONFIG = [
  { chave: 'pix_chave',    valor: '54183263840' },
  { chave: 'pix_nome',     valor: 'Julia Campos Monzani da S' },
  { chave: 'pix_cidade',   valor: 'Sao Paulo' },
  { chave: 'pix_descricao',valor: 'Cha Antonella' },
];

// Intercepta TODAS as chamadas Supabase e retorna dados mock.
async function mockSupabase(page) {
  // itens
  await page.route('**/rest/v1/itens**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_ITENS) })
  );
  // vw_cotas_progresso
  await page.route('**/rest/v1/vw_cotas_progresso**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_COTAS) })
  );
  // config
  await page.route('**/rest/v1/config**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_CONFIG) })
  );
  // RPC criar_pedido — retorna um UUID fixo
  await page.route('**/rest/v1/rpc/criar_pedido**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify('aaaabbbb-0000-0000-0000-123456789abc') })
  );
  // auth/session — não logado
  await page.route('**/auth/v1/session**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { session: null }, error: null }) })
  );
  // recados, palpites, vw_contribuintes — listas vazias (não usadas na home)
  await page.route('**/rest/v1/recados**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/rest/v1/palpites**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  await page.route('**/rest/v1/vw_contribuintes**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
  );
  // Bloqueia fonts/CDN para acelerar
  await page.route('**/fonts.googleapis.com/**', r => r.abort());
  await page.route('**/fonts.gstatic.com/**', r => r.abort());
}

async function loadPage(page) {
  await mockSupabase(page);
  await page.goto(FILE, { waitUntil: 'domcontentloaded' });
  // Aguarda loading sumir (init() completo)
  await page.waitForFunction(() => {
    const l = document.getElementById('loading');
    return l && l.classList.contains('gone');
  }, { timeout: 8000 });
}

// ──────────────────────────────────────────────────────────────────────────────
// T1 — Home carrega sem erros de console e mostra cards com SVG
// ──────────────────────────────────────────────────────────────────────────────
test('T1 — home carrega sem erros e exibe cards SVG', async ({ page }) => {
  const erros = [];
  page.on('pageerror', e => erros.push(e.message));
  page.on('console', msg => { if (msg.type() === 'error') erros.push(msg.text()); });

  await loadPage(page);

  expect(erros.filter(e => !e.includes('net::ERR_FAILED') && !e.includes('Failed to load resource'))).toHaveLength(0);

  // Deve haver pelo menos 1 card com SVG (ícone)
  const svgCount = await page.locator('.card .thumb svg').count();
  expect(svgCount).toBeGreaterThan(0);
});

// ──────────────────────────────────────────────────────────────────────────────
// T2 — Navegação entre telas funciona e scroll vai ao topo
// ──────────────────────────────────────────────────────────────────────────────
test('T2 — navTo alterna telas corretamente', async ({ page }) => {
  await loadPage(page);

  // Home visível
  await expect(page.locator('#screen-lista')).toHaveClass(/active/);

  // navTo carrinho
  await page.evaluate(() => navTo('carrinho'));
  await expect(page.locator('#screen-carrinho')).toHaveClass(/active/);
  await expect(page.locator('#screen-lista')).not.toHaveClass(/active/);

  // navTo pix (sem pedido — só verifica que a tela existe e ativa)
  await page.evaluate(() => navTo('pix'));
  await expect(page.locator('#screen-pix')).toHaveClass(/active/);

  // navTo obrigado
  await page.evaluate(() => navTo('obrigado'));
  await expect(page.locator('#screen-obrigado')).toHaveClass(/active/);

  // Volta à lista
  await page.evaluate(() => navTo('lista'));
  await expect(page.locator('#screen-lista')).toHaveClass(/active/);
});

// ──────────────────────────────────────────────────────────────────────────────
// T3 — history.back() volta da tela anterior
// ──────────────────────────────────────────────────────────────────────────────
test('T3 — history.back sai pra tela anterior sem quebrar', async ({ page }) => {
  await loadPage(page);

  await page.evaluate(() => navTo('carrinho'));
  await expect(page.locator('#screen-carrinho')).toHaveClass(/active/);

  await page.goBack();
  // Deve ter voltado à lista
  await expect(page.locator('#screen-lista')).toHaveClass(/active/);
});

// ──────────────────────────────────────────────────────────────────────────────
// T4 — Carrinho: adicionar, stepper +/-, remover; FAB bate
// ──────────────────────────────────────────────────────────────────────────────
test('T4 — carrinho item normal: add, stepper, remove; FAB correto', async ({ page }) => {
  await loadPage(page);

  // Adiciona item 1 (Fralda RN, R$70)
  await page.evaluate(() => addItem(1));

  const fabCount = page.locator('#fab-count');
  const fabTotal = page.locator('#fab-total');

  await expect(fabCount).toHaveText('1');
  // Total "R$ 70,00"
  await expect(fabTotal).toContainText('70');

  // Stepper + → qtd 2
  await page.evaluate(() => changeQty(1, 1));
  await expect(fabCount).toHaveText('2');
  await expect(fabTotal).toContainText('140');

  // Stepper - → qtd 1
  await page.evaluate(() => changeQty(1, -1));
  await expect(fabCount).toHaveText('1');

  // Remove (qtd → 0)
  await page.evaluate(() => changeQty(1, -1));
  await expect(fabCount).toHaveText('0');
  // FAB deve sumir
  await expect(page.locator('#cart-fab')).toHaveClass(/hidden/);
});

// ──────────────────────────────────────────────────────────────────────────────
// T5 — Cotas: soma N×valor, respeita max disponível
// ──────────────────────────────────────────────────────────────────────────────
test('T5 — cota: soma correta e não passa do max', async ({ page }) => {
  await loadPage(page);

  // Item 3 = Carrinho, cota R$50, cotasTotal=10, cotasReservadas=7 → max=3
  await page.evaluate(() => addCota(3));
  // qtd=1, valor R$50
  const fabTotal = page.locator('#fab-total');
  await expect(fabTotal).toContainText('50');

  // +1 → qtd=2, R$100
  await page.evaluate(() => changeQty(3, 1));
  await expect(fabTotal).toContainText('100');

  // +1 → qtd=3, R$150 (max=3)
  await page.evaluate(() => changeQty(3, 1));
  await expect(fabTotal).toContainText('150');

  // Tentar +1 além do max → deve continuar em 3 (toast de limite)
  await page.evaluate(() => changeQty(3, 1));
  const qtdMax = await page.evaluate(() => {
    const c = cart.find(x => x.id === 3);
    return c ? c.qtd : 0;
  });
  expect(qtdMax).toBe(3);
});

// ──────────────────────────────────────────────────────────────────────────────
// T6 — Total do carrinho bate com soma (valor × qtd)
// ──────────────────────────────────────────────────────────────────────────────
test('T6 — total do carrinho igual à soma manual', async ({ page }) => {
  await loadPage(page);

  await page.evaluate(() => { addItem(1); addItem(2); changeQty(2, 1); }); // 70 + 100*2 = 270
  await page.evaluate(() => navTo('carrinho'));

  const grandTotal = await page.locator('#cart-grand-total').textContent();
  expect(grandTotal).toContain('270');
});

// ──────────────────────────────────────────────────────────────────────────────
// T7 — Pix: valor correto + payload BR Code válido
// ──────────────────────────────────────────────────────────────────────────────
test('T7 — tela Pix mostra valor e BR Code válido', async ({ page }) => {
  await loadPage(page);

  await page.evaluate(() => addItem(1)); // R$70
  await page.evaluate(() => navTo('carrinho'));

  await page.fill('#guest-name', 'Ana Teste');
  await page.click('#btn-finalizar');

  // Aguarda tela pix aparecer
  await page.waitForFunction(() =>
    document.getElementById('screen-pix').classList.contains('active')
  , { timeout: 6000 });

  // Valor correto
  const pixVal = await page.locator('#pix-value').textContent();
  expect(pixVal).toContain('70');

  // Valida BR Code
  const code = await page.locator('#pix-code').textContent();
  expect(code).toMatch(/^000201/);
  expect(code).toContain('54183263840');

  // Valida CRC16 (últimos 4 chars)
  const crc = code.slice(-4);
  const body = code.slice(0, -4);
  const expectedCrc = await page.evaluate((b) => {
    let c = 0xFFFF;
    for (let i = 0; i < b.length; i++) {
      c ^= b.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) c = (c & 0x8000) ? (c << 1) ^ 0x1021 : c << 1;
      c &= 0xFFFF;
    }
    return c.toString(16).toUpperCase().padStart(4, '0');
  }, body);
  expect(crc).toBe(expectedCrc);
});

// ──────────────────────────────────────────────────────────────────────────────
// T8 — Botão "Já fiz o Pix" leva à tela obrigado
// ──────────────────────────────────────────────────────────────────────────────
test('T8 — botão "Já fiz o Pix" leva à tela obrigado', async ({ page }) => {
  await loadPage(page);

  await page.evaluate(() => addItem(1));
  await page.evaluate(() => navTo('carrinho'));
  await page.fill('#guest-name', 'Ana Teste');
  await page.click('#btn-finalizar');

  await page.waitForFunction(() =>
    document.getElementById('screen-pix').classList.contains('active')
  , { timeout: 6000 });

  // Botão existe
  const btn = page.locator('#btn-confirmei');
  await expect(btn).toBeVisible();

  // Mock da RPC confirmar_pagamento_convidado
  await page.route('**/rest/v1/rpc/confirmar_pagamento_convidado**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
  );

  await btn.click();
  await page.waitForFunction(() =>
    document.getElementById('screen-obrigado').classList.contains('active')
  , { timeout: 5000 });
});

// ──────────────────────────────────────────────────────────────────────────────
// T9 — Home sem mural e sem "quem já deu um mimo"
// ──────────────────────────────────────────────────────────────────────────────
test('T9 — home não contém mural nem contrib-strip', async ({ page }) => {
  await loadPage(page);

  // Nenhum elemento com id de mural
  expect(await page.locator('#mural-nome').count()).toBe(0);
  expect(await page.locator('#mural-msg').count()).toBe(0);
  expect(await page.locator('#recados-list').count()).toBe(0);

  // Nenhuma seção "quem já deu um mimo" visível
  expect(await page.locator('#contrib-strip').count()).toBe(0);

  // Nenhum texto "mural de recados" ou "mural de carinhos" no body
  const bodyText = await page.locator('body').innerText();
  expect(bodyText).not.toContain('mural de recados');
  expect(bodyText).not.toContain('mural de carinhos');
  expect(bodyText).not.toContain('quem já deu um mimo');
});

// ──────────────────────────────────────────────────────────────────────────────
// T10 — Hero mostra "03/07"
// ──────────────────────────────────────────────────────────────────────────────
test('T10 — hero mostra "08/07"', async ({ page }) => {
  await loadPage(page);
  const heroText = await page.locator('.hero').innerText();
  expect(heroText).toContain('08/07');
});

// ──────────────────────────────────────────────────────────────────────────────
// T11 — Finalizar sem nome mostra aviso e não avança
// ──────────────────────────────────────────────────────────────────────────────
test('T11 — finalizar sem nome mostra aviso e não avança', async ({ page }) => {
  await loadPage(page);

  await page.evaluate(() => addItem(1));
  await page.evaluate(() => navTo('carrinho'));

  // Garante que campo de nome está vazio
  await page.fill('#guest-name', '');
  await page.click('#btn-finalizar');

  // Deve continuar no carrinho
  await expect(page.locator('#screen-carrinho')).toHaveClass(/active/);
  await expect(page.locator('#screen-pix')).not.toHaveClass(/active/);

  // Toast deve aparecer
  await expect(page.locator('#toast')).toHaveClass(/show/);
});

// ──────────────────────────────────────────────────────────────────────────────
// T12 — Finalizar com carrinho vazio não avança
// ──────────────────────────────────────────────────────────────────────────────
test('T12 — finalizar com carrinho vazio não avança', async ({ page }) => {
  await loadPage(page);

  await page.evaluate(() => navTo('carrinho'));
  // Checkout nem aparece com carrinho vazio, mas tentamos chamar goToPix direto
  await page.evaluate(() => {
    document.getElementById('guest-name').value = 'Ana Teste';
  });
  await page.evaluate(() => goToPix());

  // Deve continuar sem avançar para pix
  await expect(page.locator('#screen-pix')).not.toHaveClass(/active/);

  // Toast deve aparecer
  await expect(page.locator('#toast')).toHaveClass(/show/);
});

// ──────────────────────────────────────────────────────────────────────────────
// T13 — #mamae sem token mostra tela de link inválido (RPC não é chamada)
// ──────────────────────────────────────────────────────────────────────────────
test('T13 — #mamae sem token mostra link inválido e não chama RPC', async ({ page }) => {
  let rpcCalled = false;
  await page.route('**/rest/v1/rpc/mamae_dashboard_token**', route => {
    rpcCalled = true;
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });

  await mockSupabase(page);

  await page.goto(FILE + '#mamae', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const l = document.getElementById('loading');
    return l && l.classList.contains('gone');
  }, { timeout: 8000 });

  // Tela mamae deve estar ativa
  await expect(page.locator('#screen-mamae')).toHaveClass(/active/);

  // Tela de link inválido deve estar visível
  await expect(page.locator('#mamae-invalid')).toBeVisible();

  // Painel deve estar oculto
  const panelHidden = await page.locator('#mamae-panel').evaluate(el => el.style.display === 'none');
  expect(panelHidden).toBe(true);

  // RPC NÃO deve ter sido chamada
  expect(rpcCalled).toBe(false);
});

// ──────────────────────────────────────────────────────────────────────────────
// T14 — #mamae com token mockado renderiza dashboard
// ──────────────────────────────────────────────────────────────────────────────
test('T14 — #mamae com token renderiza dashboard corretamente', async ({ page }) => {
  const MOCK_DASHBOARD = {
    total_arrecadado: 2600,
    pessoas: 25,
    itens: [
      { nome: 'Body',     eh_cota: false, quantidade: 4  },
      { nome: 'Carrinho', eh_cota: true,  quantidade: 16 },
    ],
    recados: [
      { nome: 'Maria Silva', mensagem: 'Parabéns! 💕',    criado_em: new Date().toISOString() },
      { nome: 'João Costa',  mensagem: 'Muitas bênçãos!', criado_em: new Date().toISOString() },
    ],
  };

  await mockSupabase(page);

  // Mock da RPC (não valida o token de verdade)
  await page.route('**/rest/v1/rpc/mamae_dashboard_token**', route =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOCK_DASHBOARD) })
  );

  await page.goto(FILE + '#mamae?t=token-de-teste', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const l = document.getElementById('loading');
    return l && l.classList.contains('gone');
  }, { timeout: 8000 });

  // Aguarda painel aparecer
  await page.waitForFunction(() =>
    document.getElementById('mamae-panel').style.display !== 'none'
  , { timeout: 6000 });

  // Aguarda contador animar até o valor final
  await page.waitForFunction(() => {
    const el = document.getElementById('mamae-total-val');
    return el && el.textContent.includes('2.600');
  }, { timeout: 4000 });

  // Verifica total e pessoas
  const statsText = await page.locator('#mamae-stats').innerText();
  expect(statsText).toContain('2.600');
  expect(statsText).toContain('25');

  // Verifica itens
  const itensText = await page.locator('#mamae-itens').innerText();
  expect(itensText).toContain('Body');
  expect(itensText).toContain('Carrinho');
  expect(itensText).toContain('16');

  // Verifica recados
  const recadosText = await page.locator('#mamae-recados').innerText();
  expect(recadosText).toContain('Maria Silva');
  expect(recadosText).toContain('João Costa');

  // Verifica que #mamae NÃO aparece como link/nav na home
  await page.evaluate(() => navTo('lista'));
  await expect(page.locator('#screen-lista')).toHaveClass(/active/);
  const bodyHtml = await page.locator('body').innerHTML();
  expect(bodyHtml).not.toContain('href="#mamae"');
  expect(bodyHtml).not.toContain("navTo('mamae')");
});
