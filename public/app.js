// ===== Constants (preserve this pattern) =====
const CONSTANTS = {
  API_BASE: '/api' // Cloud Functions rewrite target
};

// ===== Small API client with Firebase ID token =====
async function getIdTokenOrNull() {
  const user = firebase.auth().currentUser;
  return user ? await user.getIdToken(false) : null;
}

async function api(path, { method = 'POST', body } = {}) {
  const url = `${CONSTANTS.API_BASE}/${path.replace(/^\//, '')}`;
  let token = await getIdTokenOrNull();

  const doFetch = async (tkn) =>
    fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(tkn ? { Authorization: `Bearer ${tkn}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'include'
    });

  let res = await doFetch(token);

  // refresh token if expired
  if (res.status === 401) {
    const user = firebase.auth().currentUser;
    if (user) {
      token = await user.getIdToken(true);
      res = await doFetch(token);
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${method} ${url} failed: ${res.status} ${text}`);
  }

  const isJSON = res.headers.get('content-type')?.includes('application/json');
  return isJSON ? res.json() : res.text();
}

// ===== UI Helpers =====
const $  = (sel) => document.querySelector(sel);
const on = (el, evt, fn) => el && el.addEventListener(evt, fn);

function show(el, yes) {
  if (!el) return;
  el.style.display = yes ? 'block' : 'none';
}

// ===== Auth UI =====
function updateUserStatusUI() {
  const user = firebase.auth().currentUser;
  const div = $('#user-status');
  const loadBtn = $('#load-button');

  if (user) {
    if (div) div.textContent = 'Logged in as ' + (user.email || user.uid);
    if (loadBtn) loadBtn.disabled = false;
  } else {
    if (div)
      div.innerHTML =
        "<button id='login-google'>Log in with Google</button> or continue anonymously";
    if (loadBtn) loadBtn.disabled = false;

    const lg = $('#login-google');
    on(lg, 'click', signInWithGoogle);
  }
}

function showLoginScreen() {
  show($('#registration-screen'), false);
  show($('#login-screen'), true);
}

function showRegistrationForm() {
  show($('#login-screen'), false);
  show($('#registration-screen'), true);
}

async function signInWithGoogle() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    await firebase.auth().signInWithPopup(provider);
  } catch (e) {
    console.error(e);
    alert('Google sign-in failed');
  }
}

async function handleEmailLogin(e) {
  e?.preventDefault();
  try {
    const email = $('#email')?.value;
    const pw = $('#password')?.value;
    await firebase.auth().signInWithEmailAndPassword(email, pw);
  } catch (e2) {
    alert('Login error: ' + e2.message);
  }
}

async function handleRegistration(e) {
  e?.preventDefault();
  try {
    const email = $('#reg-email')?.value;
    const pw = $('#reg-password')?.value;
    await firebase.auth().createUserWithEmailAndPassword(email, pw);
  } catch (e2) {
    alert('Registration error: ' + e2.message);
  }
}

// ===== API Mappings (to your Cloud Functions) =====
async function fetchDataWrapped() {
  return api('fetchData', { body: { limit: 20 } });
}

async function fetchDataAnonWrapped(anonId) {
  return api('fetchDataAnon', { body: { anonId } });
}

async function getNextAnonymousIdWrapped() {
  return api('getNextAnonymousId', { method: 'POST' });
}

async function submitVoteWrapped(imageId, voteType, userId) {
  return api('vote', { body: { imageId, voteType, userId } });
}

async function fetchReleaseCatalogsWrapped() {
  return api('fetchReleaseCatalogs', { method: 'POST' });
}

async function fetchImageTypesWrapped() {
  return api('fetchImageTypes', { method: 'POST' });
}

async function getRatingsSummaryWrapped() {
  return api('getRatingsSummary', { method: 'POST' });
}

// ===== Example “Poetry, Please” button handler =====
async function loadRandomGraphic() {
  try {
    const user = firebase.auth().currentUser;
    let data;

    if (user) {
      data = await fetchDataWrapped();
    } else {
      const anonId =
        localStorage.getItem('pp_anon') || (await getNextAnonymousIdWrapped());
      localStorage.setItem('pp_anon', anonId);
      data = await fetchDataAnonWrapped(anonId);
    }

    const gal = $('#gallery');
    if (gal) {
      gal.innerHTML = `<p>Loaded ${
        data?.newGraphics?.length ?? 0
      } new items.</p>`;
    }
  } catch (e) {
    console.error(e);
    const err = $('#error');
    if (err) err.textContent = 'Error loading data: ' + e.message;
  }
}

// ===== Auth listener =====
firebase.auth().onAuthStateChanged(async (user) => {
  show($('#login-screen'), !user);
  show($('#poetry-screen'), !!user);
  updateUserStatusUI();
});

// ===== DOM Ready =====
window.addEventListener('DOMContentLoaded', () => {
  on($('#login-google'), 'click', signInWithGoogle);
  on($('#email-login-form'), 'submit', handleEmailLogin);
  on($('#registration-form'), 'submit', handleRegistration);
  on($('#show-registration'), 'click', showRegistrationForm);
  on($('#show-login'), 'click', showLoginScreen);
  on($('#load-button'), 'click', loadRandomGraphic);
  updateUserStatusUI();
});
