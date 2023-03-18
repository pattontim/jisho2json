/* eslint-disable no-console, no-undef */
// TODO: remove jQuery dependency, modern Chrome's api is solid

const styles = `
   /* highlight clickable entries on hover */
  .concept_light {
    transition: all .5s ease-in
  }
  .concept_light:hover {
    transition: all .3s ease-out;
    box-shadow: 0 0 4px 0 cornflowerblue;
    cursor: pointer;
  }
  /* notification we will add to body */
  .toast {
    position: fixed;
    top: .5rem;
    right: .5rem;
    bottom: .5rem;
    left: .5rem;
    padding: .5rem;
    max-width: calc(100vw - 1rem);
    max-height: calc(100vh - 1rem);
    overflow: auto;
    font-size: 1.2rem;
    opacity: 0;
    margin: 0 .3rem;
    border: 4px solid gainsboro;
    border-radius: 5px;
    background-color: cornflowerblue;
    color: whitesmoke;
    cursor: pointer;
    z-index: 100; /* jisho overlay is at 95 already */
    /* <pre> formatting */
    white-space: pre-wrap;
    word-wrap: break-word;
    transition: opacity .35s ease-in;
    /* disable clicks */
    pointer-events: none;
  }
  .toast.--isVisible {
    transition: opacity .25s ease-out;
    pointer-events: initial;
    opacity: .95;
  }
`;
let clickCount = 0;
let activeTimer = null;

// blastoff!
ready(init);

function init() {
  console.info('jisho2json loaded');
  let toaster; // notification element
  let pendingFade; // cancellable delayed fadeOut animation setTimeout timer

  appendStyleToHead(styles);

  renderToast().then((toast) => {
    toaster = toast;
    toaster.addEventListener('click', () => toaster.classList.remove('--isVisible'));
  }).catch(console.error);


  // parse and copy entry to clipboard
  document.querySelector('body').addEventListener('click', ({ target }) => {
    const desiredTargetSelector = '.concept_light';
    const limit = document.querySelector('#primary');
    const entry = getParent(target, desiredTargetSelector, limit);

    clearTimeout(activeTimer);
    
    if (entry) {      
      clickCount += 1;
      activeTimer = setTimeout(() => {
        let output;
        const vocab = buildJRE($(entry));
        if (clickCount >= 2) {
          output = JSON.stringify(vocab, null, 2)
        } else {
          output = formatOutput(vocab);
        }

        sendText(output); 
        toaster.textContent = output; // eslint-disable-line no-param-reassign
        toaster.classList.add('--isVisible');
        clearTimeout(pendingFade);
        pendingFade = setTimeout(() => toaster.classList.remove('--isVisible'), 5000); 
        clickCount = 0;
      }, 300); // Change the timeout duration as needed
    }
  });
}

function formatOutput(vocab) {
  let output = `${vocab.ja.readings}\n${vocab.ja.characters}\n`;
    output += vocab.pitches.length ? `${vocab.pitches.join("\n")}\n` : "";
    output += vocab.common ? "common word " : "";
    output += vocab.jlpt ? `jlpt ${vocab.jlpt} ` : "";
    output += "\n----------------\n"
    output += vocab.en.map((entry, i) => {
      const tags = entry.tags.length ? `(${entry.tags.join(", ")})\n` : "";
      const meaning = `${i + 1}. ${entry.meanings.join("; ")} `;
      const notes = entry.notes.length ? `(${entry.notes.join("; ")})\n` : "\n";
      const sentences = entry.sentences.map(s => `${s.ja}\n${s.en}`).join("\n");
      return `${tags}${meaning}${notes}${sentences}\n----------------\n`;
    }).join("\n");
  return output;
}

function getParent(el, selector, limit) {
  if (el.nodeType === 1 /* it's an element! */ && el.matches(selector)) {
    return el;
  }
  if (el === limit || !el.parentNode) {
    return false;
  }
  return el.parentNode ? getParent(el.parentNode, selector) : false;
}

function appendStyleToHead(style) {
  const element = document.createElement('style');
  element.setAttribute('type', 'text/css');
  element.appendChild(document.createTextNode(style));
  document.head.appendChild(element);
}

function renderToast() {
  return new Promise((resolve, reject) => {
    const toast = document.createElement('pre');
    Object.assign(toast, {
      className: 'toast',
      textContent: 'jisho2json loaded',
    });

    document.body.appendChild(toast);

    const toastEl = document.querySelector('.toast');
    return toastEl ? resolve(toastEl) : reject(new Error('Toast element not added to body'));
  });
}

function ready(callback) {
  if (document.readyState !== 'loading') {
    callback();
  } else {
    document.addEventListener('DOMContentLoaded', callback);
  }
}

/* Unfortunately there are few unique classes and no ids, which makes targeting specific info rather unwieldy and brittle. If any of the classes or structure changes this will have to be adjusted manually. */

function parseKana(el) {
  return (el.find('.f-dropdown li:nth-of-type(2)').text().match(/(?!\b)\W+$/) || [])[0];
}

function parseKanji(el) {
  return el.find('.text').text().trim();
}

function parseMeanings(element) {
  const defs = [];
  const defNodes = element.find('.meaning-wrapper').not('.meaning-tags:contains("Wikipedia") + .meaning-wrapper');

  defNodes.each((i, el) => {
    const tags = parseTags(el);

    // only numbered meanings have this class followed by meaning text
    const text = $(el).find('.meaning-definition-section_divider + span').text().trim();

    if (text.length) {
      defs.push({
        meanings: text.split('; ').map(smartquotes),
        notes: parseInfo(el),
        tags,
        sentences: parseSentences(el),
      });
    }
  });

  return defs;
}

function parseTags(el) {
  const tags = $(el).prev('.meaning-tags').text();
  return tags === '' ? [] : tags.split(', ').map((x) => x.trim());
}

function parseSentences(el) {
  return $.map($(el).find('.sentence'), (x) => ({
    ja: smartquotes($(x).find('.unlinked').text()),
    en: smartquotes($(x).find('.english').text()),
  }));
}

function parseInfo(el) {
  return $.map($(el).find('.supplemental_info .tag-tag, .supplemental_info .sense-tag'), (x) => $(x).text().trim());
}

function parseGeneralNotes(element) {
  const note = element.find('div.meaning-wrapper div.meaning-definition.meaning-representation_notes');
  if (note) {
    return note.text().trim();
  } else {
    return '';
  }
}

function parsePitches(element) {
  const pitchNodes = element.find('div.worddiv');
  const pitches = [];
  pitchNodes.each((i, el) => {
    const pitchEl = $(el).find('span');
    if (pitchEl) {
      var spanTexts = pitchEl.map(function() {    
        return $(this).text();
      }).get().join('');
      pitches.push(spanTexts);
    }
  });

  // consolidate entries starting with "Uniformly" and not containing "Wadoku" or "Kanjinum"
  const consolidatedPitches = {};
  let pitchesCopy = pitches.slice();
  while (pitchesCopy.length) {
    const pitch = pitchesCopy.shift();
    if (pitch.startsWith('Uniformly')) {
      const pitchParts = pitch.split(' ');
      const pitchType = pitchParts[0];
      const pitchValue = pitchParts[1];

      if (pitchType in consolidatedPitches) {
        consolidatedPitches[pitchType] += `, ${pitchValue}`;
      } else {
        consolidatedPitches[pitchType] = pitch;
      }
    } else {
      consolidatedPitches[pitch] = pitch;
    }
  }
  return Object.values(consolidatedPitches);
}
 
function buildJRE($entry) {
  const characters = parseKanji($entry);
  return {
    common: !!$entry.find('.concept_light-common').length,
    jlpt: $entry.find('.concept_light-tag:contains("JLPT")').text() || null,
    ja: {
      characters: parseKanji($entry),
      readings: parseKana($entry) || characters, // sometimes no kana if characters were hiragana to begin with
    },
    en: parseMeanings($entry),
    notes: parseGeneralNotes($entry),
    pitches: parsePitches($entry),
  };
}

function sendText(text) {
  if(navigator && navigator.clipboard) {
    navigator.clipboard.writeText(text);
  } else {
    chrome.extension.sendMessage({ text }); // eslint-disable-line no-undef
  }
}
