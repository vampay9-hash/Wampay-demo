window.addEventListener('load', async function() {
    if (!window.WAM_SB || !window.WAM_SB.client) return;
    const user = JSON.parse(localStorage.getItem('wamPayCurrentUser'));
    if (!user) return;

    const { data, error } = await window.WAM_SB.client
        .from('applications')
        .select('*')
        .eq('user_id', user.id);

    if (error) {
        console.error('[Dashboard] DB Error:', error.message);
        return;
    }

    console.log('[Dashboard] Fetched cases:', data.length);
    if (data.length > 0) {
        console.log('[Dashboard] First case:', data[0].application_number, '| Status:', data[0].status);
    }
});
