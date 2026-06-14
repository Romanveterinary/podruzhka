// --- 1. ЛОГІКА ДОСТУПУ ТА НАЛАШТУВАНЬ ---
const CORRECT_PIN = "2811";
let weatherContext = ""; // Тут буде зберігатися реальна погода

window.onload = () => {
    if (localStorage.getItem('isSetupComplete') === 'true') {
        showScreen('screen-main');
    }
    
    fetchWeather(); // Завантажуємо погоду при старті програми
    
    // АВАРІЙНИЙ КЛІК-КОД: 5 швидких тапів по екрану (меню налаштувань)
    let emergencyClicks = 0;
    let emergencyTimer;
    
    window.addEventListener('click', () => {
        emergencyClicks++;
        clearTimeout(emergencyTimer);
        emergencyTimer = setTimeout(() => { emergencyClicks = 0; }, 1500); 
        
        if (emergencyClicks >= 5) {
            emergencyClicks = 0;
            openSettingsMenu();
        }
    });
};

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active-screen'));
    document.getElementById(screenId).classList.add('active-screen');
}

function checkPassword() {
    if (document.getElementById('pin-input').value === CORRECT_PIN) {
        openSettingsMenu();
    } else {
        document.getElementById('pin-error').style.display = 'block';
    }
}

function saveSettings() {
    localStorage.setItem('geminiKey', document.getElementById('api-key').value.trim());
    localStorage.setItem('mamaName', document.getElementById('mama-name').value);
    localStorage.setItem('homeAddress', document.getElementById('home-address').value);
    localStorage.setItem('p_roman', document.getElementById('phone-roman').value);
    localStorage.setItem('p_brother', document.getElementById('phone-brother').value);
    localStorage.setItem('p_sister1', document.getElementById('phone-sister1').value);
    localStorage.setItem('p_sister2', document.getElementById('phone-sister2').value);
    localStorage.setItem('isSetupComplete', 'true');
    showScreen('screen-main');
}

function openSettingsMenu() {
    document.getElementById('api-key').value = localStorage.getItem('geminiKey') || "";
    document.getElementById('mama-name').value = localStorage.getItem('mamaName') || "";
    document.getElementById('home-address').value = localStorage.getItem('homeAddress') || "";
    document.getElementById('phone-roman').value = localStorage.getItem('p_roman') || "";
    document.getElementById('phone-brother').value = localStorage.getItem('p_brother') || "";
    document.getElementById('phone-sister1').value = localStorage.getItem('p_sister1') || "";
    document.getElementById('phone-sister2').value = localStorage.getItem('p_sister2') || "";
    
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    if (isListening && recognition) { recognition.stop(); isListening = false; }
    changeState('normal');
    
    showScreen('screen-settings');
}

// --- 2. ЗАВАНТАЖЕННЯ РЕАЛЬНОЇ ПОГОДИ ---
async function fetchWeather() {
    try {
        const geoRes = await fetch('https://get.geojs.io/v1/ip/geo.json');
        const geo = await geoRes.json();
        
        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&current_weather=true&daily=temperature_2m_max,temperature_2m_min&timezone=auto`);
        const weather = await weatherRes.json();
        
        const nowTemp = Math.round(weather.current_weather.temperature);
        const tomorrowMax = Math.round(weather.daily.temperature_2m_max[1]);
        const tomorrowMin = Math.round(weather.daily.temperature_2m_min[1]);
        
        weatherContext = `[РЕАЛЬНА ПОГОДА: Зараз ${nowTemp}°C. Завтра від ${tomorrowMin}°C до ${tomorrowMax}°C.]`;
    } catch (e) {
        weatherContext = "[РЕАЛЬНА ПОГОДА: Дані тимчасово недоступні.]";
    }
}

// --- 3. ЗВУКИ ТА АНТИ-СОН ---
function playChime(type) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = type === 'start' ? 800 : 400; osc.type = 'sine';
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 1.0);
    osc.start(); osc.stop(ctx.currentTime + 1.0);
}

let wakeLock = null; let keepAliveAudioCtx = null;
async function enableKeepAwake() {
    if (!keepAliveAudioCtx) {
        keepAliveAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = keepAliveAudioCtx.createOscillator(); const gain = keepAliveAudioCtx.createGain();
        gain.gain.value = 0; osc.connect(gain); gain.connect(keepAliveAudioCtx.destination); osc.start();
    }
    try { if ('wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (err) {}
}

// --- 4. МІКРОФОН ТА ОБРОБКА КНОПКИ ---
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null; let isListening = false;

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'uk-UA'; recognition.interimResults = false;
    recognition.onresult = async (event) => {
        playChime('stop'); changeState('thinking');
        await sendToGemini(event.results[0][0].transcript);
    };
    recognition.onspeechend = () => { recognition.stop(); isListening = false; };
}

function handleMamaButton() {
    enableKeepAwake();
    
    if (window.speechSynthesis.speaking) { 
        window.speechSynthesis.cancel(); changeState('normal'); return; 
    }
    
    if (!navigator.onLine) {
        playChime('start'); changeState('offline-mode');
        document.getElementById('status-text').innerText = "Немає інтернету!";
        const addr = localStorage.getItem('homeAddress') || "адреса не вказана";
        const phone = localStorage.getItem('p_roman');
        speakText(`Люба моя, зараз немає інтернету. Але не хвилюйся, ти вдома, твоя адреса: ${addr}. Зараз я наберу Романа.`);
        setTimeout(() => { if (phone) window.location.href = `tel:${phone}`; }, 12000);
        return;
    }

    if (!isListening && recognition) {
        playChime('start'); recognition.start(); isListening = true; changeState('listening');
    } else if (isListening) {
        recognition.stop(); isListening = false; playChime('stop'); changeState('thinking');
    }
}

function changeState(state) {
    const btn = document.getElementById('mama-btn'); const txt = document.getElementById('status-text');
    btn.className = 'main-button ' + state;
    if (state === 'listening') txt.innerText = "Уважно слухаю тебе...";
    else if (state === 'thinking') txt.innerText = "Подружка думає...";
    else if (state === 'speaking') txt.innerText = "Подружка говорить...";
    else if (state === 'offline-mode') txt.innerText = "Рятувальний режим...";
    else { btn.className = 'main-button'; txt.innerText = "Натисни будь-де, щоб поговорити"; }
}

// --- 5. ЗВ'ЯЗОК ЗІ ШТУЧНИМ ІНТЕЛЕКТОМ (GEMINI 2.5) ---
function getContext() {
    const now = new Date();
    const days = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П\'ятниця', 'Субота'];
    const timeString = now.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    const currentHour = now.getHours();
    
    // Перевірка чи пізно (після 21:00)
    let bedtimeInstruction = "";
    if (currentHour >= 21 || currentHour < 5) {
        bedtimeInstruction = "УВАГА: Зараз вже дуже пізно (після 21:00). ОБОВ'ЯЗКОВО дуже лагідно, але наполегливо нагадай їй, що час вимикати телевізор і лягати спати. Побажай на добраніч.";
    }

    return `[СЬОГОДНІ: ${days[now.getDay()]}, ${now.getDate()} число. ТОЧНИЙ ЧАС ЗАРАЗ: ${timeString}. АДРЕСА: ${localStorage.getItem('homeAddress')}]. ${weatherContext} ${bedtimeInstruction}`;
}

async function sendToGemini(userText) {
    const apiKey = localStorage.getItem('geminiKey');
    const mamaName = localStorage.getItem('mamaName') || "Ганнусю";
    const ctx = getContext();

    const systemPrompt = `Ти — «Подружка», давня подруга (75 років) і практична помічниця. Співрозмовниця — літня жінка (82 роки), звертайся до неї ${mamaName}. 

ГОЛОВНЕ ПРАВИЛО: Ти МАЄШ годинник і ЗНАЄШ погоду! Всі точні дані передані тобі в квадратних дужках []. Ніколи не кажи, що ти чогось не знаєш. Спочатку дай чітку відповідь, а потім додай турботу. Відповідай коротко (1-3 речення).

ПРАВИЛА:
1. ЧАС ТА ПОГОДА: Якщо питає котра година або погода — ПРОЧИТАЙ цифри з блоку даних. (Наприклад: "Зараз пів на третю, а на вулиці 20 градусів").
2. СОН (ПІСЛЯ 21:00): Якщо в даних є команда про пізній час, м'яко попроси її вимкнути телевізор і йти відпочивати, бо здоров'я найважливіше.
3. Побутові питання: Радь актуальні українські ціни та магазини.
4. Орієнтація: У системі є її адреса і дата. Якщо питає — чітко нагадай.
5. СЕКРЕТНА КОМАНДА ДЛЯ СИНА: Якщо звучить "відкрий налаштування" або "перейти в меню", додай у кінець тег: [MENU].
6. ДЗВІНКИ: Якщо просить подзвонити дітям, додай тег: [CALL: roman], [CALL: brother], [CALL: sister1], або [CALL: sister2].`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: [{ parts: [{ text: `${ctx}. Користувачка каже: "${userText}"` }] }]
            })
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        let aiResponse = data.candidates[0].content.parts[0].text;
        
        aiResponse = handlePhoneCalls(aiResponse);
        aiResponse = handleMenuCommand(aiResponse);
        
        speakText(aiResponse);
    } catch (error) {
        console.error("Gemini Error:", error);
        alert("ТЕХНІЧНА ПОМИЛКА: " + error.message);
        speakText("Ой, щось зв'язок пропав. Давай спробуємо ще раз?"); changeState('normal');
    }
}

// --- 6. ОБРОБКА СПЕЦІАЛЬНИХ КОМАНД ---
function handleMenuCommand(text) {
    if (text.includes('[MENU]')) {
        text = text.replace('[MENU]', '').trim();
        setTimeout(() => { openSettingsMenu(); }, 3000);
    }
    return text;
}

function handlePhoneCalls(text) {
    const callRegex = /\[CALL:\s*([a-zA-Z0-9_]+)\]/i;
    const match = text.match(callRegex);
    if (match) {
        const person = match[1].toLowerCase(); let phone = "";
        if (person === 'roman') phone = localStorage.getItem('p_roman');
        else if (person === 'brother') phone = localStorage.getItem('p_brother');
        else if (person === 'sister1') phone = localStorage.getItem('p_sister1');
        else if (person === 'sister2') phone = localStorage.getItem('p_sister2');
        
        text = text.replace(callRegex, '').trim();
        if (phone) setTimeout(() => { window.location.href = `tel:${phone}`; }, 3000);
    }
    return text;
}

// --- 7. ОЗВУЧКА ---
function speakText(text) {
    changeState('speaking');
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'uk-UA'; utterance.rate = 0.8;
    const voices = window.speechSynthesis.getVoices();
    const ukrVoice = voices.find(v => v.lang === 'uk-UA');
    if (ukrVoice) utterance.voice = ukrVoice;
    utterance.onend = () => changeState('normal');
    window.speechSynthesis.speak(utterance);
}
