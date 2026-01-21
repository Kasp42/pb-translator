// ==UserScript==
// @name         Pathbuilder2e translator
// @namespace    https://pathbuilder2e.com/
// @version      1.0.2
// @description  Local translation layer + grid viewer + cell translation editor + apply to IndexedDB
// @author       Kasp42
// @match        https://pathbuilder2e.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=pathbuilder2e.com
// @grant        none
// @run-at       document-start
// @downloadURL  https://raw.githubusercontent.com/Kasp42/pb-translator/master/pb-translator.user.js
// @updateURL    https://raw.githubusercontent.com/Kasp42/pb-translator/master/pb-translator.user.js
// ==/UserScript==

(function ()
{
  'use strict'

  // TODO: Load translations from remote by button.
  const TRANSLATION_URL = 'https://raw.githubusercontent.com/Kasp42/pb-translator/master/translations/'

  const DATA_URL_ORIGINAL = 'https://pathbuilder2e-data.b-cdn.net/'
  const DATA_AVAILABLE = ['data123', 'data_remastered61']
  const ORIGINAL_DATA_CACHE = {}
  const LANGUAGES = ['ru']
  const DEFAULT_LANG = 'en'

  const DB_NAME = 'pathbuilder2e_db'
  const STORE_NAME = 'data'

  const LS_KEY = 'pathbuilder_translations'
  const LS_LANG_KEY = 'pathbuilder_lang'

  const TABLE_PREFIX_HIDE = [
    'sqlite_autoindex_'
  ]
  const TABLE_COLUMN_SUPPORT = [
    'name',
    'description',
    'text_descrip',
    'short_description',
    'flavor_text',
    'boosts'
  ]

  function translationsLoad ()
  {
    try
    {
      return JSON.parse(localStorage.getItem(LS_KEY)) || {}
    } catch
    {
      return {}
    }
  }

  function translationsSave (a_translation)
  {
    localStorage.setItem(LS_KEY, JSON.stringify(a_translation))
  }

  function translationGet (text_lang, text_table, text_original)
  {
    const a_translation = translationsLoad()
    return a_translation?.[text_lang]?.[text_table]?.[text_original] ?? null
  }

  function translationSet (text_lang, text_table, text_original, text_translated)
  {
    const a_translation = translationsLoad()
    a_translation[text_lang] ??= {}
    a_translation[text_lang][text_table] ??= {}

    const text_cleaned = (text_translated ?? '').trim()

    if (!text_cleaned || text_cleaned === text_original)
    {
      delete a_translation[text_lang][text_table][text_original]

      if (Object.keys(a_translation[text_lang][text_table]).length === 0)
        delete a_translation[text_lang][text_table]

      if (Object.keys(a_translation[text_lang]).length === 0)
        delete a_translation[text_lang]
    }
    else
    {
      a_translation[text_lang][text_table][text_original] = text_translated
    }

    translationsSave(a_translation)
  }

  function parseCSV (text_csv)
  {
    text_csv = String(text_csv ?? '').replace(/\r\n/g, '\n')

    const a_rows = []
    let a_row = []
    let text_value = ''
    let is_quotes = false

    for (let i = 0; i < text_csv.length; i++)
    {
      const c = text_csv[i]
      const n = text_csv[i + 1]

      if (c === '"')
      {
        if (is_quotes && n === '"')
        {
          text_value += '"'
          i++
        }
        else
        {
          is_quotes = !is_quotes
        }
      }
      else if (c === ',' && !is_quotes)
      {
        a_row.push(text_value)
        text_value = ''
      }
      else if ((c === '\n' || c === '\r') && !is_quotes)
      {
        a_row.push(text_value)
        a_rows.push(a_row)
        a_row = []
        text_value = ''
        while (i + 1 < text_csv.length && (text_csv[i + 1] === '\n' || text_csv[i + 1] === '\r'))
        {
          i++
        }
      }
      else
      {
        text_value += c
      }
    }

    a_row.push(text_value)
    a_rows.push(a_row)

    return a_rows
  }

  function toCSV (a_rows)
  {
    return a_rows
    .map((a_row) =>
      a_row
      .map((text_cell) => `"${String(text_cell ?? '').replace(/"/g, '""')}"`)
      .join(',')
    )
    .join('\n')
  }

  async function originalDataLoadAll ()
  {
    for (const text_data of DATA_AVAILABLE)
    {
      const o_response = await fetch(DATA_URL_ORIGINAL + text_data + '.txt')
      if (!o_response.ok)
        throw new Error('Failed to fetch: ' + o_response.status)

      const text_response = await o_response.text()

      const text_json = LZString.decompressFromBase64(text_response)

      if (!text_json)
        throw new Error('Decompress failed (base64)')

      ORIGINAL_DATA_CACHE[text_data] = JSON.parse(text_json)
    }
  }

  function createEl (text_tag, text_style, text_element)
  {
    const node = document.createElement(text_tag)

    if (text_style)
      node.style = text_style

    if (text_element != null)
      node.textContent = text_element

    return node
  }

  function openTranslatePopup (text_table, text_original)
  {
    const dom_overlay = createEl(
      'div',
      `
      position:fixed;inset:0;
      background:rgba(0,0,0,.7);
      z-index:1000001;
      display:flex;
      align-items:center;
      justify-content:center;
      `
    )

    const dom_box = createEl(
      'div',
      `
      background:#111;
      padding:16px;
      width:700px;
      color:#eee;
      font-family:monospace;
      border:1px solid #444;
      `
    )

    const dom_title = createEl(
      'div',
      'margin-bottom:10px;font-weight:bold;',
      text_table
    )

    const dom_original = document.createElement('textarea')
    dom_original.value = text_original
    dom_original.readOnly = true
    dom_original.style = 'width: 100%;margin-bottom: 10px;field-sizing: content;min-height: 4rem;resize: none;'

    dom_box.append(dom_title, dom_original)

    const a_inputs = {}

    LANGUAGES.forEach(text_lang =>
    {
      const dom_label = document.createElement('div')
      dom_label.textContent = text_lang
      dom_label.style = 'margin-top:8px;'

      const dom_translate = document.createElement('textarea')
      dom_translate.value = translationGet(text_lang, text_table, text_original)
      dom_translate.style = 'width: 100%;field-sizing: content;min-height: 4rem;resize: none;'
      a_inputs[text_lang] = dom_translate

      dom_box.append(dom_label, dom_translate)
    })

    const dom_save = document.createElement('button')
    dom_save.textContent = 'Save'
    dom_save.style = 'margin-top:10px;'
    dom_save.onclick = () =>
    {
      LANGUAGES.forEach(lang =>
      {
        translationSet(lang, text_table, text_original, a_inputs[lang].value)
      })
      dom_overlay.remove()
    }

    dom_box.appendChild(dom_save)
    dom_overlay.appendChild(dom_box)
    dom_overlay.onclick = e => e.target === dom_overlay && dom_overlay.remove()

    document.body.appendChild(dom_overlay)
  }

  function renderGridTranslated ({ csv, container, tableName })
  {
    container.innerHTML = ''

    const a_rows = parseCSV(csv)
    const a_headers = a_rows.shift() || []

    let sortCol = null
    let sortAsc = true

    const dom_table = document.createElement('table')
    dom_table.style = 'border-collapse:collapse;width:100%;color:#eee;font-family:monospace;'

    const dom_thead = document.createElement('thead')
    const dom_tr_head = document.createElement('tr')

    const a_cell_support = {}
    a_headers.forEach((text_header, i_header) =>
    {
      if (TABLE_COLUMN_SUPPORT.indexOf(text_header) >= 0)
        a_cell_support[i_header] = true

      const dom_th_head = document.createElement('th')
      dom_th_head.textContent = text_header
      dom_th_head.style =
        'position:sticky;top:0;background:#222;cursor:pointer;border:1px solid #444;padding:4px;font-weight:600;'

      dom_th_head.onclick = () =>
      {
        sortAsc = sortCol === i_header ? !sortAsc : true
        sortCol = i_header

        a_rows.sort((a, b) =>
        {
          const A = a[i_header] ?? ''
          const B = b[i_header] ?? ''
          return sortAsc
            ? A.localeCompare(B, undefined, { numeric: true })
            : B.localeCompare(A, undefined, { numeric: true })
        })

        renderGridTranslated({
          csv: toCSV([a_headers, ...a_rows]),
          container,
          tableName
        })
      }

      dom_tr_head.appendChild(dom_th_head)
    })

    dom_thead.appendChild(dom_tr_head)
    dom_table.appendChild(dom_thead)

    const dom_tbody = document.createElement('tbody')

    a_rows.forEach((row) =>
    {
      const dom_tr = document.createElement('tr')

      row.forEach((text_cell, i_cell) =>
      {
        const dom_td = document.createElement('td')
        dom_td.style = 'border:1px solid #333;padding:3px;min-width:80px;vertical-align:top;'
        dom_td.textContent = text_cell

        if (a_cell_support[i_cell])
        {
          dom_td.style = 'border:1px solid #333;padding:3px;min-width:80px;vertical-align:top;cursor:pointer;'
          dom_td.title = 'Click to edit translation'

          dom_td.onclick = () =>
          {
            openTranslatePopup(tableName, text_cell)
          }
        }

        dom_tr.appendChild(dom_td)
      })

      dom_tbody.appendChild(dom_tr)
    })

    dom_table.appendChild(dom_tbody)
    container.appendChild(dom_table)
  }

  function editorPopupOpen ()
  {
    const dom_overlay = createEl(
      'div',
      `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.6);
      z-index: 999999;
      display: flex;
      justify-content: center;
      align-items: center;
    `
    )

    const dom_panel = createEl(
      'div',
      `
      width: 92%;
      height: 92%;
      background: #111;
      color: #eee;
      display: flex;
      font-family: monospace;
      border: 1px solid #333;
      position: relative;
    `
    )

    const dom_sidebar = createEl(
      'div',
      `
      width: 320px;
      border-right: 1px solid #444;
      overflow: auto;
      padding-top: 56px;
    `
    )

    const dom_editor = createEl(
      'div',
      `
      flex: 1;
      overflow: auto;
      background: #000;
      padding-top: 56px;
    `
    )

    const dom_top_bar = createEl(
      'div',
      `
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      height: 44px;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      background: #151515;
      border-bottom: 1px solid #333;
    `
    )

    const dom_title = createEl('div', 'font-weight:700;margin-right:10px;', 'PB2E Translator')

    const dom_update = createEl('button', 'width: auto;', 'Update Translations From GitHub');
    dom_update.onclick = async () => {
      const o_response = await fetch(TRANSLATION_URL+currentLangGet()+'.json')

      if (!o_response.ok)
        throw new Error('Failed to fetch: ' + o_response.status);

      const a_response = await o_response.json();

      const a_translation = translationsLoad();
      a_translation[currentLangGet()] = a_response;
      translationsSave(a_translation);

      indexedDBPatch(currentLangGet());
    }

    const dom_data_select = document.createElement('select')
    DATA_AVAILABLE.forEach((text_data) =>
    {
      const dom_option = document.createElement('option')
      dom_option.value = text_data
      dom_option.textContent = text_data
      dom_data_select.appendChild(dom_option)
    })

    let text_current_dataset = dom_data_select.value
    let a_tables = {}
    let text_selected_table = null

    const dom_status = createEl('div', 'margin-left:0;opacity:.8;font-size:12px;', 'Ready')

    const dom_close = document.createElement('div')
    dom_close.innerHTML = '&times;'
    dom_close.style = `
      position:absolute;
      top:10px;
      right:14px;
      font-size:28px;
      cursor:pointer;
    `
    dom_close.onclick = () =>
    {
      dom_overlay.remove()
      indexedDBPatch(currentLangGet())
    }

    dom_top_bar.append(dom_title, dom_update, dom_data_select, dom_close, dom_status)

    dom_panel.appendChild(dom_sidebar)
    dom_panel.appendChild(dom_editor)
    dom_panel.appendChild(dom_top_bar)
    dom_overlay.appendChild(dom_panel)
    document.body.appendChild(dom_overlay)

    dom_overlay.addEventListener('click', (e) =>
    {
      if (e.target === dom_overlay) dom_overlay.remove()
    })

    function renderTableList ()
    {
      dom_sidebar.innerHTML = ''
      const dom_list = createEl('div', 'padding:0 0 8px 0;')
      dom_sidebar.appendChild(dom_list)

      const a_table_names = Object.keys(a_tables)
      .filter((t) => TABLE_PREFIX_HIDE.indexOf(t) === -1)
      .sort((a, b) => a.localeCompare(b))

      a_table_names.forEach((text_table) =>
      {
        const dom_table = createEl(
          'div',
          `
          padding: 6px 10px;
          cursor: pointer;
          border-bottom: 1px solid #333;
          user-select: none;
        `,
          text_table
        )

        function setSelectedStyle (isSelected)
        {
          dom_table.style.background = isSelected ? '#222' : ''
          dom_table.style.color = isSelected ? '#fff' : '#eee'
        }

        setSelectedStyle(text_selected_table === text_table)

        dom_table.onclick = () =>
        {
          if (text_selected_table === text_table)
            return // do not re-render same

          text_selected_table = text_table

          renderTableList()

          dom_status.textContent = `Table: ${text_table}`
          dom_editor.dataset.table = text_table

          renderGridTranslated({
            csv: a_tables[text_table],
            container: dom_editor,
            tableName: text_table
          })
        }

        dom_list.appendChild(dom_table)
      })

      if (a_table_names.length === 0)
      {
        dom_list.appendChild(createEl('div', 'padding:10px;opacity:.7;', 'No tables found'))
      }
    }

    async function reloadDataset ()
    {
      dom_status.textContent = 'Loading dataset...'
      text_selected_table = null
      dom_editor.innerHTML = ''
      a_tables = JSON.parse(JSON.stringify(ORIGINAL_DATA_CACHE[text_current_dataset]))
      dom_status.textContent = `Loaded: ${text_current_dataset} (${Object.keys(a_tables).length} tables)`
      renderTableList()
    }

    dom_data_select.onchange = async() =>
    {
      text_current_dataset = dom_data_select.value
      await reloadDataset()
    }

    reloadDataset().catch((e) =>
    {
      console.error(e)
      dom_status.textContent = 'Failed to load dataset (see console)'
    })
  }

  function currentLangGet ()
  {
    return localStorage.getItem(LS_LANG_KEY) || DEFAULT_LANG
  }

  function currentLangSet (lang)
  {
    localStorage.setItem(LS_LANG_KEY, lang)
  }

  function indexedDBPatch (lang)
  {
    const tr = translationsLoad()[lang] || {}

    const req = indexedDB.open(DB_NAME)
    req.onsuccess = e =>
    {
      const db = e.target.result
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)

      store.openCursor().onsuccess = async ev =>
      {
        const cursor = ev.target.result
        if (!cursor) return

        let tables = Object.assign({}, ORIGINAL_DATA_CACHE[cursor.key]);

        Object.entries(tr).forEach(([table, map]) =>
        {
          if (!tables[table]) return

          const rows = parseCSV(tables[table])
          for (let i = 1; i < rows.length; i++)
          {
            for (let j = 0; j < rows[i].length; j++)
            {
              const o = rows[i][j]
              if (map[o]) rows[i][j] = map[o]
            }
          }
          tables[table] = toCSV(rows)
        })

        const encoded = LZString.compressToBase64(JSON.stringify(tables))
        store.put(encoded, cursor.key)

        cursor.continue()
      }
    }
  }

  function installControls ()
  {
    const box = document.createElement('div')
    box.style = `
    position:fixed;
    top:5px;
    right:5px;
    z-index:999998;
    background:#111;
    border:1px solid #444;
    padding:6px;
    font-family:monospace;
    display: inline-flex;
  `

    const langSel = document.createElement('select')
    const lang_list = [...LANGUAGES, DEFAULT_LANG]
    lang_list.forEach(l =>
    {
      const o = document.createElement('option')
      o.value = l
      o.textContent = l
      langSel.appendChild(o)
    })
    langSel.value = currentLangGet()

    langSel.onchange = () =>
    {
      currentLangSet(langSel.value)
      indexedDBPatch(langSel.value)
    }

    const btn = document.createElement('button')
    btn.textContent = 'Translate Panel'
    btn.style = 'padding: 6px 10px;background: rgb(17, 17, 17);color: rgb(238, 238, 238);border: 1px solid rgb(68, 68, 68);font-family: monospace;cursor: pointer;width: 200px;margin-left: 7px;'
    btn.onclick = editorPopupOpen

    box.append(langSel, btn)
    document.addEventListener('DOMContentLoaded', () => document.body.appendChild(box))
  }

  const dom_script = document.createElement('script')
  dom_script.src = 'https://cdn.jsdelivr.net/npm/lz-string@1.5.0/libs/lz-string.min.js'
  dom_script.onload = async function ()
  {
    installControls()
    await originalDataLoadAll()
  }
  document.head.appendChild(dom_script)
})()
