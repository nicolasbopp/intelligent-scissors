/** Explanations behind the "?" buttons in the sidebar, keyed by the id of the control. */
const HELP: Record<string, string> = {
    autoAnchor:
        'Also called path cooling. When the start of the path has stayed the same over 12 mouse moves, ' +
        'that part is fixed with an anchor. You only click where the path takes a wrong turn. ' +
        'Turn it off to place every anchor yourself, which gives more control at sharp corners.',
    center:
        'The intensity in the middle of the shown range. Move it towards the brightness of the structure ' +
        'you want to trace. Pixels outside the window become pure black or white and have no edges there.',
    width:
        'How wide the shown intensity range is. A narrow window raises the contrast, so faint edges ' +
        'become strong and the path follows them more readily, but noise is amplified too. ' +
        'A wide window shows everything with less contrast.',
    view:
        'Image shows the picture. Cost map shows what the algorithm sees: the path prefers dark pixels. ' +
        'If the edge you want is not dark in the cost map, no weighting will make the path follow it.',
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

/** Adds a "?" button to every control that has an explanation. The text opens below the control. */
export function setUpHelp() {
    for (const [id, text] of Object.entries(HELP)) {
        const control = document.getElementById(id) ?? document.querySelector(`[name="${id}"]`);
        if (!control) continue;
        const host = control.closest('.slider, .check, .segmented') as HTMLElement;

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

        if (host.classList.contains('slider')) host.querySelector('output')!.before(button);
        else if (host.classList.contains('check')) host.querySelector('small')!.before(button);
        else host.after(button);
    }
}
