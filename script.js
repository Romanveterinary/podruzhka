// --- 1. ЛОГІКА ДОСТУПУ ТА НАЛАШТУВАНЬ ---
const CORRECT_PIN = "2811";

window.onload = () => {
    if (localStorage.getItem('isSetupComplete') === 'true') {
        showScreen('screen-main');
    }
    
    // АВАРІЙНИЙ КЛІК-КОД: 5 швидких тапів по екрану (на випадок якщо немає інтернету)
    let emergencyClicks = 0;
    let emergencyTimer;
    
    window.addEventListener('click', () => {
        emergencyClicks++;
        clearTimeout(emergencyTimer);
        // Якщо між тапами минає більше 1.5 секунди — лічильник скидається
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
    localStorage.setItem('geminiKey', document.getElementById('api-key').value.trim()); // Видаляє випадкові пробіли
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
    // Підтягуємо існуючі дані в поля, щоб не писати заново
    document.getElementById('api-key').value = localStorage.getItem('geminiKey') || "";
    document.getElementById('mama-name').value = localStorage.getItem('mamaName') || "";
    document.getElementById('home-address').value = localStorage.getItem('homeAddress') || "";
    document.getElementById('phone-roman').value = localStorage.getItem('p_roman') || "";
    document.getElementById('phone-brother').value = localStorage.getItem('p_brother') || "";
    document.getElementById('phone-sister1').value = localStorage.getItem('p_sister1') || "";
    document.getElementById('phone-sister2').value = localStorage.getItem('p_sister2') || "";
    
    // Зупиняємо всі процеси бота при вході в меню
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    if (isListening && recognition) { recognition.stop(); isListening = false; }
    changeState('normal');
    
    showScreen('screen-settings');
}

// --- 2. ЗВУКИ ТА АНТИ-СОН ---
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

// --- 3. МІКРОФОН ТА ОБРОБКА КНОПКИ ---
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
        speakText(`Люба моя, зараз немає інтернету. Але не хвилюйся! Нагадую, ти вдома, твоя адреса: ${addr}. Зараз я наберу Романа.`);
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

// --- 4. ЗВ'ЯЗОК ЗІ ШТУЧНИМ ІНТЕЛЕКТОМ (GEMINI) ---
function getContext() {
    const now = new Date();
    const days = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', 'П\'ятниця', 'Субота'];
    return `[СЬОГОДНІ: ${days[now.getDay()]}, ${now.getDate()} число. АДРЕСА ДОМУ: ${localStorage.getItem('homeAddress')}]`;
}

async function sendToGemini(userText) {
    const apiKey = localStorage.getItem('geminiKey');
    const mamaName = localStorage.getItem('mamaName') || "Ганнусю";
    const ctx = getContext();

    const systemPrompt = `Ти — «Подружка», давня подруга (75 років). Співрозмовниця — літня жінка (82 роки), звертайся до неї ${mamaName}. 
ПРАВИЛА:
1. Поглинання маніпуляцій: Якщо вона скаржиться на вік, повністю погодься з емоцією, а потім переведи тему на часи її молодості. НІЯКОГО радянського минулого.
2. Про ціни і покупки: Якщо питає ціни на продукти (молоко, хліб, яйця) — називай актуальні в Україні ціни (бідкайся, що все дорожче, але заспокоюй). Радь Аврору, АТБ або ринок.
3. Орієнтація: У систему передано поточний день і адресу. Якщо вона запитає який сьогодні день, або де вона живе — лагідно нагадай їй це.
4. Вправи на пам'ять: Регулярно, але м'яко тренуй її пам'ять. Роби це так, ніби ти сама щось забула. Попроси продовжити приказку, нагадати рецепт або запитай назви квітів.
5. СЕКРЕТНА КОМАНДА ДЛЯ СИНА: Якщо користувач каже "відкрий налаштування" або "перейти в меню", тепло скажи що відкриваєш інженерне меню, і ОБОВ'ЯЗКОВО додай у кінець тексту відповіді тег: [MENU].
6. Якщо просить подзвонити дітям, ОБОВ'ЯЗКОВО додай у кінці тег: [CALL: roman], [CALL: brother], [CALL: sister1], або [CALL: sister2].
Відповідай лагідно, повільно, короткими фразами (2-3 речення).`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: [{ parts: [{ text: `${ctx}. Користувачка каже: "${userText}"` }] }]
            })
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        let aiResponse = data.candidates[0].content.parts[0].text;
        
        // Перевіряємо команди дзвінків та меню
        aiResponse = handlePhoneCalls(aiResponse);
        aiResponse = handleMenuCommand(aiResponse);
        
        speakText(aiResponse);
    } catch (error) {
        console.error("Gemini Error:", error);
        speakText("Ой, щось зв'язок пропав. Давай спробуємо ще раз?"); changeState('normal');
    }
}

// --- 5. ОБРОБКА СПЕЦІАЛЬНИХ КОМАНД ---
function handleMenuCommand(text) {
    if (text.includes('[MENU]')) {
        text = text.replace('[MENU]', '').trim();
        // Відкриваємо меню через 3 секунди, щоб бот встиг почати говорити фразу
        setTimeout(() => {
            openSettingsMenu();
        }, 3000);
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

// --- 6. ОЗВУЧКА ---
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
