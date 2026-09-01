(function () {
  const EVENT_SLUG = 'agrokomplex-nitra';
  const DEFAULT_MAPS = ['field', 'orchard', 'forest'];
  const form = document.getElementById('singleStationForm');
  if (!form) return;

  const registrationScreen = document.getElementById('singleRegistration');
  const gameLayout = document.getElementById('gameLayout');
  const mapChoices = document.getElementById('singleMapChoices');
  const notice = document.getElementById('singleNotice');
  const startButton = document.getElementById('singleStartMission');
  const emailInput = document.getElementById('singleEmail');
  const nameInput = document.getElementById('singleName');
  const eventName = document.getElementById('singleEventName');
  let maps = DEFAULT_MAPS.slice();
  const requestedMap = new URLSearchParams(window.location.search).get('map');
  let selectedMap = DEFAULT_MAPS.includes(requestedMap) ? requestedMap : 'field';
  let submitting = false;
  let lastError = null;

  const mapDescriptionKeys = {
    orchard: 'orchardChoiceDesc',
    forest: 'forestChoiceDesc',
    field: 'fieldChoiceDesc',
  };

  function renderMapChoices() {
    mapChoices.innerHTML = maps.map(function (map) {
      const selected = map === selectedMap ? ' selected' : '';
      return '<label class="map-choice single-map-choice' + selected + '" style="--map-image: url(/img/' + map + '-aerial.png)">' +
        '<input type="radio" name="selected_map" value="' + AgroApi.escapeHtml(map) + '"' +
        (map === selectedMap ? ' checked' : '') + '>' +
        '<span class="selected-badge">' + AgroI18n.t('selected') + '</span>' +
        '<span class="map-choice-content"><span class="eyebrow">' + AgroI18n.t('mission') + '</span><h3>' +
        AgroApi.title(map) + '</h3><p>' + AgroI18n.t(mapDescriptionKeys[map]) + '</p></span></label>';
    }).join('');
  }

  function renderSubmitButton() {
    startButton.textContent = AgroI18n.t(submitting ? 'startingMission' : 'startMission');
    startButton.disabled = submitting;
  }

  function showError(error) {
    lastError = error;
    notice.className = 'notice error';
    notice.textContent = AgroI18n.apiError(error, 'singleStationRegistrationFailed');
  }

  function showRegistration() {
    if (window.AgroGame) AgroGame.resetSingleStationGame();
    document.body.classList.remove('single-playing');
    registrationScreen.classList.remove('hidden');
    gameLayout.classList.add('hidden');
    emailInput.value = '';
    nameInput.value = '';
    notice.className = 'notice hidden';
    notice.textContent = '';
    lastError = null;
    submitting = false;
    renderSubmitButton();
    renderMapChoices();
    window.setTimeout(function () { emailInput.focus(); }, 0);
  }

  mapChoices.addEventListener('change', function (event) {
    if (event.target.name !== 'selected_map') return;
    selectedMap = event.target.value;
    renderMapChoices();
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (submitting) return;

    submitting = true;
    lastError = null;
    notice.className = 'notice hidden';
    renderSubmitButton();

    AgroApi.post('/api/single-station/register', {
      event_slug: EVENT_SLUG,
      email: emailInput.value,
      name: nameInput.value,
      selected_map: selectedMap,
    })
      .then(function (result) {
        emailInput.value = '';
        nameInput.value = '';
        document.body.classList.add('single-playing');
        registrationScreen.classList.add('hidden');
        gameLayout.classList.remove('hidden');
        return AgroGame.startSingleStationPlayer(result.registration);
      })
      .catch(function (error) {
        AgroApi.logError('Single-station registration failed', error);
        document.body.classList.remove('single-playing');
        registrationScreen.classList.remove('hidden');
        gameLayout.classList.add('hidden');
        showError(error);
      })
      .finally(function () {
        submitting = false;
        renderSubmitButton();
      });
  });

  document.addEventListener('click', function (event) {
    if (!event.target.closest('[data-next-player]')) return;
    showRegistration();
  });

  AgroApi.config()
    .then(function (config) {
      maps = config.maps && config.maps.length ? config.maps : maps;
      if (!maps.includes(selectedMap)) selectedMap = maps[0];
      eventName.textContent = (config.eventConfig && config.eventConfig.eventName) || config.eventName || 'Agrokomplex Nitra';
      renderMapChoices();
    })
    .catch(function (error) {
      AgroApi.logError('Single-station config failed', error);
      renderMapChoices();
    });

  window.addEventListener('agro:languagechange', function () {
    renderMapChoices();
    renderSubmitButton();
    if (lastError) showError(lastError);
  });

  renderMapChoices();
  renderSubmitButton();
})();
