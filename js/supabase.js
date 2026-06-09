const SUPABASE_URL = APP_CONFIG.supabase.url;
const SUPABASE_KEY = APP_CONFIG.supabase.anonKey;

async function supabaseFetch(path, options = {}) {
    const url = `${SUPABASE_URL}/rest/v1/${path}`;
    const headers = {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    };
    const response = await fetch(url, {
        ...options,
        headers: { ...headers, ...options.headers }
    });
    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Supabase ${response.status}: ${err}`);
    }
    if (response.status === 204) return null;
    return response.json();
}

async function saveMessage(sessionId, role, message) {
    try {
        return await supabaseFetch(APP_CONFIG.tables.conversations, {
            method: 'POST',
            body: JSON.stringify({
                session_id: sessionId,
                role: role,
                message: message
            })
        });
    } catch (err) {
        console.error('Error saving message:', err);
        return null;
    }
}

async function getConversationHistory(sessionId, limit = 20) {
    try {
        const query = `${APP_CONFIG.tables.conversations}?session_id=eq.${encodeURIComponent(sessionId)}&order=created_at.asc&limit=${limit}`;
        return await supabaseFetch(query);
    } catch (err) {
        console.error('Error fetching history:', err);
        return [];
    }
}

async function scheduleAppointment(clientName, clientPhone, appointmentDate, notes) {
    try {
        const data = await supabaseFetch(APP_CONFIG.tables.appointments, {
            method: 'POST',
            body: JSON.stringify({
                client_name: clientName,
                client_phone: clientPhone,
                appointment_date: appointmentDate,
                status: 'scheduled',
                notes: notes
            })
        });
        return { success: true, data };
    } catch (err) {
        console.error('Error scheduling appointment:', err);
        return { success: false, error: err.message };
    }
}

async function getAppointments(phone) {
    try {
        let query = `${APP_CONFIG.tables.appointments}?order=appointment_date.desc`;
        if (phone) {
            query += `&client_phone=eq.${encodeURIComponent(phone)}`;
        }
        return await supabaseFetch(query);
    } catch (err) {
        console.error('Error fetching appointments:', err);
        return [];
    }
}
