/** Explanations behind the "?" buttons in the sidebar, keyed by the id of the slider. */
const HELP: Record<string, string> = {
    gradient:
        'How strongly the path is drawn to places where the brightness changes quickly. ' +
        'Higher: follows strong edges and ignores weak ones. Lower: strong edges matter less, ' +
        'useful when a nearby high-contrast edge keeps pulling the path away.',
    laplacian:
        'Zero crossings of the Laplacian mark the exact middle of an edge. Higher: the path sits ' +
        'precisely on the edge line, one pixel wide. Lower: the path may run a pixel or two beside it, ' +
        'but is less distracted by small texture.',
    direction:
        'Penalty for sharp changes of direction. Higher: smoother paths that do not jump between ' +
        'nearby fibres or noise, but they may cut tight corners. Lower: the path follows every kink.',
    sigma:
        'Blurs the image before edges are computed. Higher (1.5 to 3): ignores grain and noise and ' +
        'follows the larger structures, but fine details are lost. 0: every pixel counts, for clean images.',
};

/** Adds a "?" button to every slider that has an explanation. The text opens below the slider. */
export function setUpHelp() {
    for (const [id, text] of Object.entries(HELP)) {
        const host = document.getElementById(id)?.closest<HTMLElement>('.slider');
        if (!host) continue;

        const explanation = document.createElement('p');
        explanation.className = 'help-text';
        explanation.id = `${id}Help`;
        explanation.textContent = text;
        explanation.hidden = true;
        host.after(explanation);

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'help';
        button.textContent = '?';
        button.setAttribute('aria-label', 'Explain');
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', explanation.id);
        button.addEventListener('click', e => {
            // The button sits inside a <label>; keep the click from toggling its input
            e.preventDefault();
            explanation.hidden = !explanation.hidden;
            button.setAttribute('aria-expanded', String(!explanation.hidden));
        });

        host.querySelector('output')!.before(button);
    }
}
