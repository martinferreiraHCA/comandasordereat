/* =========================================================
   app.js — interfaz, opciones y vista previa
   ========================================================= */
(function () {
  'use strict';

  const $ = function (id) { return document.getElementById(id); };

  const ui = {
    dropzone: $('dropzone'), fileInput: $('fileInput'), fileStatus: $('fileStatus'),
    btnDemo: $('btnDemo'), btnPrint: $('btnPrint'), btnReset: $('btnReset'),
    optionsCard: $('optionsCard'), statsCard: $('statsCard'), stats: $('stats'),
    sheets: $('sheets'), emptyState: $('emptyState'), previewInfo: $('previewInfo'),
    previewScroll: $('previewScroll'),
    zoomIn: $('btnZoomIn'), zoomOut: $('btnZoomOut'), zoomLabel: $('zoomLabel'),
    groupBy: $('optGroupBy'), sortBy: $('optSortBy'), newPage: $('optNewPage'),
    layout: $('optLayout'), title: $('optTitle'), date: $('optDate'),
    summary: $('optSummary'), onlyComments: $('optOnlyComments'),
    cutMarks: $('optCutMarks'), status: $('optStatus'), pageHint: $('pageHint')
  };

  const STORE_KEY = 'comandas.opts.v1';
  const state = { data: null, fileName: '', zoom: 0.55 };

  /* ---------------- opciones ---------------- */

  function readOptions() {
    return {
      groupBy: ui.groupBy.value,
      sortBy: ui.sortBy.value,
      newPage: ui.newPage.checked,
      layout: ui.layout.value,
      title: ui.title.value.trim() || 'COMANDA DE COCINA',
      date: ui.date.value.trim(),
      summary: ui.summary.checked,
      onlyComments: ui.onlyComments.checked,
      cutMarks: ui.cutMarks.checked,
      status: ui.status.value
    };
  }

  function saveOptions() {
    const o = readOptions();
    delete o.date;                       // la fecha depende del archivo
    try { localStorage.setItem(STORE_KEY, JSON.stringify(o)); } catch (e) { /* modo privado */ }
  }

  function restoreOptions() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); } catch (e) { saved = null; }
    if (!saved) return;
    if (saved.groupBy) ui.groupBy.value = saved.groupBy;
    if (saved.sortBy) ui.sortBy.value = saved.sortBy;
    if (saved.layout) ui.layout.value = saved.layout;
    if (typeof saved.newPage === 'boolean') ui.newPage.checked = saved.newPage;
    if (typeof saved.summary === 'boolean') ui.summary.checked = saved.summary;
    if (typeof saved.onlyComments === 'boolean') ui.onlyComments.checked = saved.onlyComments;
    if (typeof saved.cutMarks === 'boolean') ui.cutMarks.checked = saved.cutMarks;
    if (saved.title) ui.title.value = saved.title;
  }

  /* ---------------- estado del archivo ---------------- */

  function setStatus(msg, kind) {
    ui.fileStatus.textContent = msg;
    ui.fileStatus.className = 'filestatus' + (kind ? ' is-' + kind : '');
  }

  function fillStatusFilter(orders) {
    const values = Array.from(new Set(orders.map(function (o) { return o.status; }).filter(Boolean)));
    ui.status.textContent = '';
    const all = document.createElement('option');
    all.value = '__all';
    all.textContent = 'Todos (' + orders.length + ')';
    ui.status.appendChild(all);
    values.forEach(function (v) {
      const n = orders.filter(function (o) { return o.status === v; }).length;
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v + ' (' + n + ')';
      ui.status.appendChild(opt);
    });
    ui.status.parentElement.hidden = values.length < 2;
  }

  function todayString() {
    const d = new Date();
    return String(d.getDate()).padStart(2, '0') + '/' +
           String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
  }

  function loadParsed(parsed, fileName) {
    state.data = parsed;
    state.fileName = fileName;

    ui.optionsCard.hidden = false;
    ui.statsCard.hidden = false;
    ui.btnPrint.disabled = false;
    ui.btnReset.disabled = false;
    ui.emptyState.hidden = true;

    if (!ui.title.value.trim()) ui.title.value = 'COMANDA DE COCINA';
    ui.date.value = parsed.meta.date || parsed.meta.export || todayString();

    fillStatusFilter(parsed.orders);

    const extra = parsed.warnings.length ? ' · ' + parsed.warnings.join(' ') : '';
    setStatus(fileName + ' · ' + parsed.orders.length + ' pedidos leídos' + extra,
              parsed.warnings.length ? null : 'ok');

    render();
  }

  /* ---------------- render ---------------- */

  function filteredOrders() {
    const opts = readOptions();
    return state.data.orders.filter(function (o) {
      if (opts.status !== '__all' && o.status !== opts.status) return false;
      if (opts.onlyComments && !o.comment) return false;
      return true;
    });
  }

  function render() {
    if (!state.data) return;
    const opts = readOptions();
    const orders = filteredOrders();

    ui.sheets.textContent = '';

    if (!orders.length) {
      ui.previewInfo.textContent = 'Ningún pedido pasa los filtros';
      ui.stats.textContent = '';
      ui.btnPrint.disabled = true;
      return;
    }

    const out = Comandas.build(orders, opts);
    const frag = document.createDocumentFragment();
    out.sheets.forEach(function (s) { frag.appendChild(s); });

    // el autofit necesita medir sin zoom: se aplica el zoom después
    ui.sheets.style.zoom = '';
    ui.sheets.style.transform = '';
    ui.sheets.style.height = '';
    ui.sheets.appendChild(frag);
    Comandas.autofit(ui.sheets);

    ui.btnPrint.disabled = false;
    ui.previewInfo.textContent = out.sheets.length + ' hoja' + (out.sheets.length === 1 ? '' : 's') +
                                 ' A4 · ' + orders.length + ' tickets';

    // aviso de papel: cortar por grupo puede multiplicar las hojas
    const ahorro = out.stats.hojas - out.stats.hojasMinimas;
    if (opts.newPage && ahorro >= 2) {
      ui.pageHint.textContent = 'Con esta agrupación salen ' + out.stats.hojas +
        ' hojas. Destildando esta opción bajan a ' + out.stats.hojasMinimas +
        ' (cada ticket igual lleva su grupo impreso).';
      ui.pageHint.hidden = false;
    } else {
      ui.pageHint.hidden = true;
    }

    ui.stats.textContent = '';
    [
      ['Pedidos', out.stats.pedidos],
      ['Unidades', out.stats.unidades],
      ['Grupos', out.stats.grupos],
      ['Con observaciones', out.stats.observaciones],
      ['Hojas A4', out.stats.hojas]
    ].forEach(function (pair) {
      const dt = document.createElement('dt'); dt.textContent = pair[0];
      const dd = document.createElement('dd'); dd.textContent = pair[1];
      ui.stats.appendChild(dt); ui.stats.appendChild(dd);
    });

    applyZoom();
    saveOptions();
  }

  /* ---------------- zoom de la vista previa ---------------- */

  const CAN_ZOOM = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('zoom', '0.5');

  function applyZoom() {
    const z = state.zoom;
    if (CAN_ZOOM) {
      ui.sheets.style.zoom = z;                       // reflowa: no deja espacio muerto
    } else {
      ui.sheets.style.transform = 'scale(' + z + ')';
      ui.sheets.style.transformOrigin = 'top center';
      const n = ui.sheets.children.length;
      ui.sheets.style.height = n ? (n * 297 * z) + 'mm' : '';
    }
    ui.zoomLabel.textContent = Math.round(z * 100) + ' %';
  }

  function zoom(delta) {
    state.zoom = Math.min(1.5, Math.max(0.2, Math.round((state.zoom + delta) * 100) / 100));
    applyZoom();
  }

  /* ---------------- carga de archivos ---------------- */

  function handleFile(file) {
    if (!file) return;
    const ok = /\.(xlsx|xlsm|xls|csv)$/i.test(file.name);
    if (!ok) { setStatus('Formato no soportado: usá .xlsx, .xls o .csv', 'error'); return; }

    setStatus('Leyendo ' + file.name + '…');
    const reader = new FileReader();
    reader.onerror = function () { setStatus('No pude leer el archivo.', 'error'); };
    reader.onload = function (e) {
      try {
        const parsed = Comandas.parseWorkbook(new Uint8Array(e.target.result));
        loadParsed(parsed, file.name);
      } catch (err) {
        console.error(err);
        setStatus('Error: ' + err.message, 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  /* ---------------- datos de ejemplo (ficticios) ---------------- */

  const DEMO = [
    ['Pending Orders'],
    [],
    ['Pick-up date: ' + todayString()],
    ['Status: Pending'],
    ['Total orders: 12/12'],
    [],
    ['ID', 'Channel', 'Commensal', 'Class', 'Pick-up time', 'Products', 'Comments', 'Status'],
    ['10001', 'App', 'Ana Pérez', 'Kinder - 4 años A', '11:30', '1x MENÚ INFANTIL DEL DÍA', '-', 'Pending'],
    ['10002', 'App', 'Bruno Díaz', 'Kinder - 5 años B', '11:30', '1x Milanesa de pollo al plato con fritas', 'Sin sal', 'Pending'],
    ['10003', 'App', 'Carla Gómez', 'Primaria - 1ºB', '12:30', '1x MENÚ DEL DÍA', '-', 'Pending'],
    ['10004', 'App', 'Diego Fernández', 'Primaria - 2ºA', '12:30', '1x Menú del día - Opcional - PASTAS', 'Porción chica', 'Pending'],
    ['10005', 'App', 'Elena Rossi', 'Primaria - 3ºC', '12:30', '1x Milanesa de carne al plato con papas fritas', 'Con tomate', 'Pending'],
    ['10006', 'App', 'Facundo Silva', 'Primaria - 5ºD', '12:50', '1x MENÚ DEL DÍA', '-', 'Pending'],
    ['10007', 'App', 'Gabriela Núñez', 'Primaria - 6ºB', '12:30', '1x Papas noissette\n3x Sticks Mayonesa', '-', 'Pending'],
    ['10008', 'App', 'Hernán Costa', 'Secundaria - 7ºA', '11:55', '1x Milanesa sola al pan', 'De carne, gracias', 'Pending'],
    ['10009', 'App', 'Irene Vega', 'Secundaria - 7ºD', '11:55', '1x Ensalada completa', 'Sin lechuga', 'Pending'],
    ['10010', 'App', 'Joaquín Méndez', 'Secundaria - 8ºC', '13:30', '1x MENÚ DEL DÍA', '-', 'Pending'],
    ['10011', 'App', 'Karina Luz', 'Secundaria - 9ºB', '11:55', '1x Milanesa de pollo al plato con ensalada', '-', 'Pending'],
    ['10012', 'App', 'Marcos Ruiz', 'Funcionarios', '12:30', '1x Agua con gas\n1x MENÚ DEL DÍA', '-', 'Pending']
  ];

  function loadDemo() {
    const ws = XLSX.utils.aoa_to_sheet(DEMO);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
    try {
      loadParsed(Comandas.parseWorkbook(new Uint8Array(buf)), 'ejemplo-pedidos.xlsx (datos ficticios)');
    } catch (err) {
      setStatus('Error en los datos de ejemplo: ' + err.message, 'error');
    }
  }

  /* ---------------- eventos ---------------- */

  ui.dropzone.addEventListener('click', function () { ui.fileInput.click(); });
  ui.dropzone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ui.fileInput.click(); }
  });
  ui.fileInput.addEventListener('change', function (e) { handleFile(e.target.files[0]); });

  ['dragenter', 'dragover'].forEach(function (ev) {
    ui.dropzone.addEventListener(ev, function (e) { e.preventDefault(); ui.dropzone.classList.add('is-over'); });
  });
  ['dragleave', 'drop'].forEach(function (ev) {
    ui.dropzone.addEventListener(ev, function (e) { e.preventDefault(); ui.dropzone.classList.remove('is-over'); });
  });
  ui.dropzone.addEventListener('drop', function (e) {
    if (e.dataTransfer && e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  ['dragover', 'drop'].forEach(function (ev) {
    window.addEventListener(ev, function (e) { e.preventDefault(); });
  });

  ui.btnDemo.addEventListener('click', loadDemo);

  [ui.groupBy, ui.sortBy, ui.layout, ui.status].forEach(function (n) {
    n.addEventListener('change', render);
  });
  [ui.newPage, ui.summary, ui.onlyComments, ui.cutMarks].forEach(function (n) {
    n.addEventListener('change', render);
  });
  [ui.title, ui.date].forEach(function (n) {
    let t;
    n.addEventListener('input', function () { clearTimeout(t); t = setTimeout(render, 250); });
  });

  ui.btnPrint.addEventListener('click', function () { window.print(); });

  // el papel siempre se mide sin zoom: reajustamos justo antes de imprimir
  window.addEventListener('beforeprint', function () {
    if (!state.data) return;
    ui.sheets.style.zoom = '';
    ui.sheets.style.transform = '';
    ui.sheets.style.height = '';
    Comandas.autofit(ui.sheets);
  });
  window.addEventListener('afterprint', function () {
    if (state.data) applyZoom();
  });
  ui.btnReset.addEventListener('click', function () {
    state.data = null;
    ui.fileInput.value = '';
    ui.sheets.textContent = '';
    ui.optionsCard.hidden = true;
    ui.statsCard.hidden = true;
    ui.btnPrint.disabled = true;
    ui.btnReset.disabled = true;
    ui.emptyState.hidden = false;
    ui.previewInfo.textContent = 'Vista previa';
    setStatus('Ningún archivo cargado.');
  });

  ui.zoomIn.addEventListener('click', function () { zoom(0.1); });
  ui.zoomOut.addEventListener('click', function () { zoom(-0.1); });

  restoreOptions();
  applyZoom();
})();
