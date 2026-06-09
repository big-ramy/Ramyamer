const GEMINI_API_URL =
'https://dhfxhlpomlhbnwqgrrob.supabase.co/functions/v1/chatbot';
const SYSTEM_PROMPT = `أنت مساعد ذكي يمثل {name} ({engName})، {title}.

**قواعد الرد:**
- تحدث بأسلوب بشري طبيعي واحترافي.
- اجعل الردود مختصرة لكن غير مبتورة.
- أجب بجملة أو فقرتين حسب الحاجة.
- لا تستخدم أسلوب الروبوت أو القوائم إلا عند الحاجة.
- اجعل الرد يبدو وكأنه صادر من مستشار محترف يتحدث مباشرة مع العميل.
- كن مباشراً ومفيداً دون إطالة
- إذا سئلت عن كيف يمكنك أن تفيد شركة، أجب بثقة واذكر مثالاً واقعياً واحداً من خبرات {name}

**خبراتك ومجالات الإجابة:**
- خبير تطوير وإدارة مبيعات - 9+ سنوات (بنوك، تجزئة، مقاولات، عقارات)
- إذا ورد سؤال فني تخصصي مثل:
  • كم نسبة الاستقطاع من العملاء للتمويل العقاري؟
  • كم الدعم السكني للمواطن؟
  • كيف يتم حساب القسط والدعم؟
  أجب بمعلومات دقيقة ومهنية بناء على معرفتك في التمويل العقاري السعودي (برنامج الرهن العقاري، دعم صندوق التنمية العقارية، شروط البنوك)
- إذا سئلت عن التمويل العقاري: اشرح أن النسبة تختلف حسب البنك والمنتج، وتتراوح نسبة الاستقطاع بين 25%-33% من الراتب حسب سياسة البنك المركزي، وأن دعم سكني يغطي جزءاً من الأقساط حسب تصنيف المستفيد

**حجز موعد مقابلة:**
- اسأل عن الاسم ورقم الجوال والتاريخ خطوة بخطوة
- بعد الحصول على جميع المعلومات، قم باستدعاء الدالة scheduleAppointment وأكد الحجز

**عروض العمل:**
- اسأل عن: اسم الشركة، المسمى الوظيفي، الراتب، الموقع
- حدد مدى ملاءمة العرض

كن محترفاً، ودوداً، ومختصراً.`;

let chatSessionId = null;
let isProcessing = false;

// Appointment state tracking for multi-turn booking
let pendingAppointment = null;

function getSessionId() {
    if (chatSessionId) return chatSessionId;
    chatSessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    return chatSessionId;
}

async function sendMessage(userMessage) {
    if (isProcessing) return;
    isProcessing = true;

    const chatBody = document.getElementById('chatBody');
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('chatSendBtn');

    input.disabled = true;
    sendBtn.disabled = true;

    addMessageToUI(userMessage, 'user');
    input.value = '';

    const sessionId = getSessionId();

    await saveMessage(sessionId, 'user', userMessage);

    // Check for appointment data in user message before calling AI
    await checkForAppointmentData(userMessage);

    const history = await getConversationHistory(sessionId);

    const lang = document.documentElement.lang;
    const systemPrompt = SYSTEM_PROMPT
        .replace(/{name}/g, APP_CONFIG.bot.name)
        .replace(/{engName}/g, APP_CONFIG.bot.engName)
        .replace(/{title}/g, APP_CONFIG.bot.title)
        .replace(/{engTitle}/g, APP_CONFIG.bot.engTitle);

    const contextMessages = history.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : msg.role,
        parts: [{ text: msg.message }]
    }));

    const langInstruction = lang === 'en'
    ? 'Respond in natural professional English. Be concise but conversational.'
    : 'تحدث بالعربية بأسلوب طبيعي واحترافي. كن مختصراً ولكن ليس بشكل آلي أو مبتور.';

    const requestBody = {
        contents: [
            {
                role: 'user',
                parts: [{ text: systemPrompt + '\n\n' + langInstruction }]
            },
            ...contextMessages,
            {
                role: 'user',
                parts: [{ text: userMessage }]
            }
        ],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 300,
            topP: 0.9
        }
    };

    try {
        const response = await fetch(GEMINI_API_URL, {
             method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': APP_CONFIG.supabase.anonKey,
                'Authorization': `Bearer ${APP_CONFIG.supabase.anonKey}`
            },
            body: JSON.stringify(requestBody)
        })

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error.message || 'API Error');
        }

        const botReply = data.candidates?.[0]?.content?.parts?.[0]?.text || 'عذراً، لم أتمكن من معالجة طلبك.';

        await saveMessage(sessionId, 'assistant', botReply);

        await checkForAppointmentRequest(botReply, userMessage);

        addMessageToUI(botReply, 'assistant');
    } catch (err) {
        console.error('Chat error:', err);
        const errorMsg = document.documentElement.lang === 'en'
            ? 'Sorry, I encountered an error. Please try again later.'
            : 'عذراً، حدث خطأ. يرجى المحاولة لاحقاً.';
        addMessageToUI(errorMsg, 'assistant');
    } finally {
        isProcessing = false;
        input.disabled = false;
        sendBtn.disabled = false;
        input.focus();
        scrollChatToBottom();
    }
}

async function checkForAppointmentData(userMessage) {
    const nameMatch = userMessage.match(/(?:اسمي|الاسم|اسمي|my name is|name)\s*[:：]?\s*([^\n،,.\d][^\n،,]+)/i);
    const phoneMatch = userMessage.match(/(?:رقم|جوال|هاتف|phone|mobile|whatsapp)\s*[:：]?\s*(\d[\d\s\-]*\d)/i);
    const dateMatch = userMessage.match(/(?:\d{4}[-/]\d{1,2}[-/]\d{1,2})/);

    if (!pendingAppointment) {
        pendingAppointment = {};
    }

    if (nameMatch && !pendingAppointment.name) {
        pendingAppointment.name = nameMatch[1].trim();
    }
    if (phoneMatch && !pendingAppointment.phone) {
        pendingAppointment.phone = phoneMatch[1].trim().replace(/\s+/g, '');
    }
    if (dateMatch && !pendingAppointment.date) {
        pendingAppointment.date = dateMatch[0];
    }

    // If we have all three, schedule immediately
    if (pendingAppointment.name && pendingAppointment.phone && pendingAppointment.date) {
        const appointmentDate = new Date(pendingAppointment.date);
        if (!isNaN(appointmentDate.getTime())) {
            const result = await scheduleAppointment(
                pendingAppointment.name,
                pendingAppointment.phone,
                appointmentDate.toISOString(),
                'تم حجزه عبر البوت الذكي'
            );
            if (result.success) {
                const msg = document.documentElement.lang === 'en'
                    ? `✅ Appointment confirmed for ${pendingAppointment.name} on ${appointmentDate.toLocaleString()}`
                    : `✅ تم تأكيد موعد المقابلة للسيد/ة ${pendingAppointment.name} في ${appointmentDate.toLocaleString('ar-SA')}`;
                addMessageToUI(msg, 'assistant');
                await saveMessage(getSessionId(), 'assistant', msg);
            }
            pendingAppointment = null;
        }
    }
}

async function checkForAppointmentRequest(botReply, userMessage) {
    const combined = (userMessage + ' ' + botReply).toLowerCase();
    const appointmentKeywords = ['حجز', 'موعد', 'مقابلة', 'appointment', 'interview', 'schedule', 'meet'];

    const hasAppointmentIntent = appointmentKeywords.some(k => combined.includes(k));

    if (!hasAppointmentIntent) {
        // If no appointment intent but we have partial data, keep it for next message
        return;
    }

    // Try to extract from current message too (for single-message bookings)
    const nameMatch = userMessage.match(/(?:اسمي|الاسم|اسمي|my name is|name)\s*[:：]?\s*([^\n،,.\d][^\n،,]+)/i);
    const phoneMatch = userMessage.match(/(?:رقم|جوال|هاتف|phone|mobile|whatsapp)\s*[:：]?\s*(\d[\d\s\-]*\d)/i);
    const dateMatch = userMessage.match(/(?:\d{4}[-/]\d{1,2}[-/]\d{1,2})/);

    if (!pendingAppointment) {
        pendingAppointment = {};
    }

    if (nameMatch && !pendingAppointment.name) {
        pendingAppointment.name = nameMatch[1].trim();
    }
    if (phoneMatch && !pendingAppointment.phone) {
        pendingAppointment.phone = phoneMatch[1].trim().replace(/\s+/g, '');
    }
    if (dateMatch && !pendingAppointment.date) {
        pendingAppointment.date = dateMatch[0];
    }

    if (pendingAppointment.name && pendingAppointment.phone && pendingAppointment.date) {
        const appointmentDate = new Date(pendingAppointment.date);
        if (!isNaN(appointmentDate.getTime())) {
            const result = await scheduleAppointment(
                pendingAppointment.name,
                pendingAppointment.phone,
                appointmentDate.toISOString(),
                'تم حجزه عبر البوت الذكي'
            );
            if (result.success) {
                const msg = document.documentElement.lang === 'en'
                    ? `✅ Appointment confirmed for ${pendingAppointment.name} on ${appointmentDate.toLocaleString()}`
                    : `✅ تم تأكيد موعد المقابلة للسيد/ة ${pendingAppointment.name} في ${appointmentDate.toLocaleString('ar-SA')}`;
                addMessageToUI(msg, 'assistant');
                await saveMessage(getSessionId(), 'assistant', msg);
            }
        }
    }
}

function addMessageToUI(text, role) {
    const chatBody = document.getElementById('chatBody');
    const msgDiv = document.createElement('div');
    msgDiv.className = `chat-msg mb-3 p-3 shadow-sm`;
    msgDiv.style.cssText = `background: ${role === 'user' ? '#e3f2fd' : 'white'}; border-radius: 12px; ${role === 'user' ? 'border-top-left-radius: 0;' : 'border-top-right-radius: 0;'} font-size: 0.9rem;`;
    msgDiv.innerHTML = `<span class="text-dark lh-lg">${text.replace(/\n/g, '<br>')}</span>`;
    chatBody.appendChild(msgDiv);
    scrollChatToBottom();
}

function scrollChatToBottom() {
    const chatBody = document.getElementById('chatBody');
    chatBody.scrollTop = chatBody.scrollHeight;
}

async function handleChatSubmit() {
    const input = document.getElementById('chatInput');
    const msg = input.value.trim();
    if (msg && !isProcessing) {
        await sendMessage(msg);
    }
}

function initChat() {
    const input = document.getElementById('chatInput');
    const sendBtn = document.getElementById('chatSendBtn');

    sendBtn.addEventListener('click', handleChatSubmit);
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleChatSubmit();
        }
    });
}
