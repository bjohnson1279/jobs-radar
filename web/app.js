let state = { jobs: [], updatedAt: null, refreshing: false, error: null };
const results = document.querySelector('#jobs');
const status = document.querySelector('#status');
const refresh = document.querySelector('#refresh');
const query = document.querySelector('#query');
const locationFilter = document.querySelector('#location');
const applicationFilter = document.querySelector('#applications');
function ageLabel(date, label) {
    if (!date) return `${label} unknown`;
    const days = Math.max(0, Math.floor((Date.now() - Date.parse(date)) / 86400000));
    return `${label} ${days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} ago`}`;
}
function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
}
function render() {
    if (state.profile) {
        document.querySelector('#profile-description').textContent = state.profile.description;
        const label = state.profile.locationLabel;
        const remoteLabel = `Remote (${state.profile.country})`;
        locationFilter.options[0].textContent = state.profile.includeLocal && state.profile.includeRemote ? `${label} + ${remoteLabel}` : state.profile.includeLocal ? label : remoteLabel;
        locationFilter.options[1].textContent = label;
        locationFilter.options[1].disabled = !state.profile.includeLocal;
        locationFilter.options[2].textContent = state.profile.includeLocal ? `${remoteLabel} outside ${label}` : remoteLabel;
        locationFilter.options[2].disabled = !state.profile.includeRemote;
    }
    const term = query.value.toLowerCase();
    const jobs = state.jobs.filter(job => `${job.company} ${job.title} ${job.description}`.toLowerCase().includes(term)
        && (applicationFilter.value === 'all' || (applicationFilter.value === 'applied' ? !!job.appliedAt : !job.appliedAt && job.inLatestSearch))
        && (locationFilter.value === 'all' || (locationFilter.value === 'local' ? job.isLocal : job.isRemote && (!state.profile?.includeLocal || !job.isLocal))));
    results.replaceChildren();
    refresh.disabled = state.refreshing;
    refresh.textContent = state.refreshing ? 'Searching…' : 'Search job boards';
    status.textContent = state.error || (state.refreshing ? 'Searching job boards. This can take a few minutes…'
        : state.updatedAt ? `${jobs.length} matches · Highest score first · Updated ${new Date(state.updatedAt).toLocaleString()}`
            : 'No search yet. Search job boards to load current listings.');
    if (state.updatedAt && !jobs.length) results.append(element('p', 'No listings match these filters. Try a broader search or refresh the job boards.'));
    for (const job of jobs) {
        const card = element('article');
        const heading = element('div', undefined, 'heading');
        const info = element('div');
        info.append(element('h2', job.title), element('p', `${job.company} · ${job.location || 'Location unspecified'}`, 'meta'));
        const score = element('div', undefined, 'score');
        score.append(element('strong', String(job.score)), element('small', 'FIT / 100'));
        score.title = 'Weighted fit normalized to 0–100. Rounded ties retain the underlying ranking.';
        const dates = element('p', job.postedAt ? ageLabel(job.postedAt, job.postedDateKind === 'lastPublished' ? 'Last published' : 'Posted') : `${ageLabel(job.firstSeenAt, 'First seen')} · Posting date unknown`, 'meta');
        dates.title = `Posted: ${job.postedAt || 'Unknown'}; First seen: ${job.firstSeenAt}; Last seen: ${job.lastSeenAt}`;
        info.append(dates, element('p', `${ageLabel(job.lastSeenAt, 'Last seen')}${job.inLatestSearch ? '' : ' · Not returned in latest search'}`, 'meta'));
        if (job.appliedAt) info.append(element('p', `Applied ${new Date(job.appliedAt).toLocaleString()}`, 'applied'));
        heading.append(info, score); card.append(heading);
        const actions = element('div', undefined, 'application-actions');
        const dateLabel = element('label', 'Application date');
        const dateInput = element('input'); dateInput.type = 'date';
        const today = new Date();
        const localToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        dateInput.max = localToday;
        dateInput.value = job.appliedAt ? new Date(job.appliedAt).toLocaleDateString('en-CA') : localToday;
        dateLabel.append(dateInput); actions.append(dateLabel);
        const save = element('button', job.appliedAt ? 'Update application date' : 'Mark as applied');
        const undo = element('button', 'Undo applied');
        async function update(applied) {
            save.disabled = true; undo.disabled = true;
            try {
                if (applied && (!dateInput.value || !dateInput.checkValidity())) throw new Error('Choose a valid application date.');
                const response = await fetch('/api/application', {
                    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Jobs-Radar': 'application' },
                    body: JSON.stringify({ id: job.id, applied, ...(applied ? { appliedAt: new Date(`${dateInput.value}T00:00:00`).toISOString() } : {}) }),
                });
                if (!response.ok) throw new Error((await response.json()).error || 'Could not save application.');
                await load();
                status.textContent += applied ? ' · Application saved.' : ' · Applied status removed.';
            } catch (error) { status.textContent = error.message; save.disabled = false; undo.disabled = false; }
        }
        save.addEventListener('click', () => update(true));
        undo.addEventListener('click', () => update(false));
        actions.append(save); if (job.appliedAt) actions.append(undo);
        card.append(actions);
        const criteria = element('div', undefined, 'criteria');
        for (const [label, signals] of [['Pros', job.pros], ['Cons', job.cons]]) {
            const column = element('section', undefined, label === 'Cons' ? 'cons' : 'pros');
            column.append(element('h3', label));
            const list = element('ul');
            for (const signal of signals) list.append(element('li', `${signal.label} (${signal.contribution > 0 ? '+' : ''}${signal.contribution})`));
            if (!signals.length) list.append(element('li', label === 'Cons' ? 'No penalty wording detected' : 'No positive criteria detected'));
            column.append(list); criteria.append(column);
        }
        card.append(criteria);
        const details = element('details');
        details.append(element('summary', 'Job description'), element('p', job.description || 'Description unavailable from this source.', 'description'));
        card.append(details);
        try {
            const url = new URL(job.url);
            if (['https:', 'http:'].includes(url.protocol)) {
                const link = element('a', 'View original listing ↗');
                link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
                const paragraph = element('p'); paragraph.append(link); card.append(paragraph);
            }
        } catch { /* Invalid listing URLs are omitted. */ }
        results.append(card);
    }
}
async function load() {
    try {
        const response = await fetch('/api/jobs');
        if (!response.ok) throw new Error();
        state = await response.json(); render();
    } catch { status.textContent = 'Unable to reach Jobs Radar. Check that the local server is running.'; }
    if (state.refreshing) setTimeout(load, 2000);
}
refresh.addEventListener('click', async () => {
    refresh.disabled = true;
    try {
        const response = await fetch('/api/refresh', { method: 'POST', headers: { 'X-Jobs-Radar': 'refresh' } });
        if (!response.ok) throw new Error();
        await load();
    } catch { status.textContent = 'Unable to start search. Try again.'; refresh.disabled = false; }
});
query.addEventListener('input', render);
locationFilter.addEventListener('change', render);
applicationFilter.addEventListener('change', render);
load();
