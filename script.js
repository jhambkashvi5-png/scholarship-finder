
// Curated discovery dataset. Verify current deadlines and eligibility at each official source.
// Load the catalogue from the JSON file in this GitHub repository.
let PROGRAMS = [];
let catalogError = null;
const catalogReady = fetch('./scholarships.json', {cache: 'no-cache'})
  .then(async response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('Expected a JSON array of scholarships');
    PROGRAMS = data;
  })
  .catch(error => {
    catalogError = error;
    console.error('Scholarship catalogue:', error);
  });

const COUNTRY_OPTIONS = [
  'United States', 'United Kingdom', 'Canada', 'Australia',
  'Germany', 'France', 'Netherlands', 'Sweden', 'Italy',
  'Spain', 'Türkiye', 'China', 'Japan', 'South Korea',
  'Singapore', 'Hong Kong', 'Taiwan', 'Switzerland',
  'Finland', 'Hungary', 'Denmark', 'Multiple countries',
  'Multiple European countries'
];

const $ = id => document.getElementById(id);
let schools = [];
let profile = null;
let saved = new Set(JSON.parse(localStorage.getItem('sfSaved') || '[]'));

$('countries').innerHTML = COUNTRY_OPTIONS
  .map(c => `<label><input type="checkbox" value="${c}"> ${c}</label>`)
  .join('');

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function drawSchools() {
  $('schoolTags').innerHTML = schools.map((s, i) =>
    `<span class="tag">${escapeHTML(s)}
      <button type="button" data-remove="${i}"
        aria-label="Remove ${escapeHTML(s)}">×</button>
    </span>`
  ).join('');
}

function addSchool() {
  const v = $('schoolInput').value.trim();

  if (v && !schools.some(s => s.toLowerCase() === v.toLowerCase())) {
    schools.push(v);
  }

  $('schoolInput').value = '';
  drawSchools();
}

$('addSchool').onclick = addSchool;

$('schoolInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addSchool();
  }
});

$('schoolTags').onclick = e => {
  if (e.target.dataset.remove !== undefined) {
    schools.splice(Number(e.target.dataset.remove), 1);
    drawSchools();
  }
};

function gather() {
  return {
    age: Number($('age').value),
    level: $('level').value,
    field: $('field').value,
    countries: [...$('countries').querySelectorAll('input:checked')]
      .map(x => x.value),
    citizenship: $('citizenship').value,
    income: $('income').value,
    schools: [...schools]
  };
}

$('profile').onsubmit = async e => {
  e.preventDefault();

  if (!$('profile').reportValidity()) return;

  await catalogReady;

  if (catalogError) {
    alert(
      'Scholarship database could not be loaded. ' +
      'Check scholarships.json is uploaded beside index.html, then refresh.'
    );
    return;
  }

  profile = gather();

  if (!profile.countries.length) {
    alert('Please select at least one target country.');
    return;
  }

  localStorage.setItem('sfProfile', JSON.stringify(profile));
  showResults();
};

function match(p) {
  const reasons = [];
  const warnings = [];

  // Exclude only confirmed age mismatches when the catalogue
  // provides an explicit age limit for the relevant application.
  const ageTooYoung = Number.isFinite(Number(p.minAge)) &&
    profile.age < Number(p.minAge);

  const maxAge = p.maxAge?.[profile.level];
  const ageTooOld = Number.isFinite(Number(maxAge)) &&
    profile.age >= Number(maxAge);

  if (ageTooYoung) {
    warnings.push(
      `Listed minimum age is ${p.minAge}; check whether age is assessed ` +
      'at application, award, or university entry.'
    );
  }

  if (ageTooOld) {
    warnings.push(
      'Your entered age may exceed the listed age limit; verify the official rules.'
    );
  }

  // Degree and field are hard filters because the user selected them.
  if (!Array.isArray(p.levels) || !p.levels.includes(profile.level)) {
    return null;
  }

  if (
    !Array.isArray(p.fields) ||
    (!p.fields.includes('Any field') && !p.fields.includes(profile.field))
  ) {
    return null;
  }

  // Exclude applicants only when the database explicitly lists
  // their citizenship as excluded.
  if (
    profile.citizenship &&
    Array.isArray(p.excludeCitizens) &&
    p.excludeCitizens.includes(profile.citizenship)
  ) {
    return null;
  }

  // Match destination names, intended universities, and multi-country
  // opportunities. Unknown destination data should not be silently
  // treated as confirmed ineligibility.
  const destinations = Array.isArray(p.countries) ? p.countries : [];

  const country = destinations.some(c =>
    profile.countries.includes(c)
  );

  const school = profile.schools.some(s =>
    Array.isArray(p.schools) && p.schools.some(t =>
      typeof t === 'string' &&
      (s.toLowerCase().includes(t.toLowerCase()) ||
       t.toLowerCase().includes(s.toLowerCase()))
    )
  );

  const multi = destinations.includes('Multiple countries') ||
    destinations.includes('Multiple European countries');

  const destinationUnknown = destinations.length === 0;

  // Keep the previous destination matching behavior, but allow records
  // with missing destination information to appear with a warning.
  if (!country && !school && !multi && !destinationUnknown) {
    return null;
  }

  if (school) {
    reasons.push('Matches one of your intended universities.');
  } else if (country) {
    reasons.push('Connected to your selected study destination.');
  } else if (multi) {
    warnings.push(
      'Multi-country program: verify whether your target country is included.'
    );
  } else {
    warnings.push(
      'Study destination is not clearly specified in the catalogue; verify it.'
    );
  }

  if (!profile.citizenship) {
    warnings.push('Nationality-specific eligibility still needs checking.');
  }

  if (profile.field !== 'Any field') {
    warnings.push('Confirm that your exact course or field is eligible.');
  }

  if (ageTooYoung || ageTooOld) {
    warnings.push('Age eligibility needs checking against the official rules.');
  }

  if (typeof p.requirements !== 'string' || !p.requirements.trim()) {
    warnings.push('Eligibility requirements are incomplete in the catalogue.');
  }

  return {
    p,
    reasons,
    warnings,
    score: (school ? 4 : 0) + (country ? 3 : 0) + (multi ? 1 : 0)
  };
}

function showResults() {
  $('profileView').hidden = true;
  $('intro').hidden = true;
  $('results').hidden = false;

  const parts = [
    ...profile.countries,
    profile.level,
    profile.field,
    profile.schools.join(', ') || 'Any university',
    'Income profile stays here'
  ];

  $('summary').innerHTML = parts
    .map(s => `<span class="tag">${escapeHTML(s)}</span>`)
    .join('');

  render();
  $('results').scrollIntoView({behavior: 'smooth'});
}

function render() {
  let items = PROGRAMS.map(match).filter(Boolean);

  const query = $('search').value.trim().toLowerCase();

  items = items.filter(({p, score}) =>
    (!$('savedOnly').checked || saved.has(p.name)) &&
    (!$('needOnly').checked || p.need) &&
    (!$('strongOnly').checked || score >= 3) &&
    (!query || [
      p.name,
      p.provider,
      p.description,
      p.requirements,
      ...(Array.isArray(p.tags) ? p.tags : [])
    ].join(' ').toLowerCase().includes(query))
  );

  const sort = $('sort').value;

  items.sort((a, b) =>
    sort === 'name'
      ? a.p.name.localeCompare(b.p.name)
      : sort === 'saved'
        ? Number(saved.has(b.p.name)) - Number(saved.has(a.p.name)) ||
          b.score - a.score
        : b.score - a.score
  );

  $('count').textContent =
    `${items.length} PROGRAM${items.length === 1 ? '' : 'S'} IN YOUR STARTING LIST`;

  $('cards').innerHTML = items.length
    ? items.map(({p, reasons, warnings}) => `
      <article class="card">
        <div class="card-main">
          <div class="card-top">
            <div>
              <h3>${escapeHTML(p.name)}</h3>
              <div class="provider">${escapeHTML(p.provider)}</div>
            </div>
            <button class="save ${saved.has(p.name) ? 'active' : ''}"
              data-save="${escapeHTML(p.name)}">
              ${saved.has(p.name) ? '✓ Saved' : '♧ Save'}
            </button>
          </div>

          <p class="desc">${escapeHTML(p.description)}</p>

          <div>
            ${(Array.isArray(p.tags) ? p.tags : []).map(t =>
              `<span class="mini">${escapeHTML(t)}</span>`
            ).join('')}
          </div>

          <p class="match">✧ ${escapeHTML([...reasons, ...warnings].join(' '))}</p>
        </div>

        <div class="card-details">
          <div>
            <span class="eyebrow">ELIGIBILITY TO EXPLORE</span>
            <p>${escapeHTML(p.requirements || 'Check official eligibility requirements.')}</p>
          </div>
          <div>
            <span class="eyebrow">INCOME CONTEXT</span>
            <p>${escapeHTML(p.income || 'Income eligibility needs checking.')}</p>
          </div>
        </div>

        <div class="card-bottom">
          <small>Application dates and award details may change. Verify current requirements directly.</small>
          <a href="${escapeHTML(p.url || '#')}" target="_blank" rel="noopener noreferrer">
            Official program details ↗
          </a>
        </div>
      </article>
    `).join('')
    : `<div class="empty">
        No matches in this curated starting list. Try removing a filter
        or adjusting your study destinations. This does not mean you are
        ineligible for all scholarships.
      </div>`;
}

$('cards').onclick = e => {
  const btn = e.target.closest('[data-save]');
  if (!btn) return;

  const n = btn.dataset.save;

  saved.has(n) ? saved.delete(n) : saved.add(n);

  localStorage.setItem('sfSaved', JSON.stringify([...saved]));
  render();
};

['search', 'sort', 'savedOnly', 'needOnly', 'strongOnly'].forEach(id =>
  $(id).addEventListener(id === 'search' ? 'input' : 'change', render)
);

$('clearFilters').onclick = () => {
  $('search').value = '';
  $('savedOnly').checked = false;
  $('needOnly').checked = false;
  $('strongOnly').checked = false;
  $('sort').value = 'relevant';
  render();
};

$('edit').onclick = () => {
  $('results').hidden = true;
  $('intro').hidden = false;
  $('profileView').hidden = false;
  $('intro').scrollIntoView({behavior: 'smooth'});
};

try {
  const prior = JSON.parse(localStorage.getItem('sfProfile') || 'null');

  if (prior) {
    $('age').value = prior.age || '';
    $('level').value = prior.level || '';
    $('field').value = prior.field || '';
    $('income').value = prior.income || '';
    $('citizenship').value = prior.citizenship || '';

    [...$('countries').querySelectorAll('input')].forEach(x => {
      x.checked = prior.countries?.includes(x.value);
    });

    schools = prior.schools || [];
    drawSchools();
  }
} catch (e) {}
