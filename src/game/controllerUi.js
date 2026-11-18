import { connectedGamepad, padAxis, padButton, padNeutral } from './gamepad.js';
import { t } from './i18n.js';
import { MENU_CONTROLLER_BINDINGS as DEFAULT_MENU, CONTROLLER_BUTTON_LABELS } from './controllerBindings.js';

const CONTROLS = 'button, a[href], input, select, textarea, summary, [role="button"], [role="tab"], [tabindex="0"]';
const PANELS = ['#rotate-notice', '#new-career-panel', '#pause-panel', '#adventure-panel', '#story-panel', '#chat-panel', '#ship-panel', '#map-panel', '#arena-panel', '#observer-panel', '#title-screen', '#dock-screen'];
const BACK = ['cancel-new-career', 'close-options', 'resume-flight', 'close-chat', 'close-ship', 'close-map', 'close-story', 'adventure-exit', 'close-arena', 'observer-exit'];
const visible = element => Boolean(element && !element.disabled && !element.closest('[hidden], .is-hidden, [inert]') && element.getClientRects().length);

// One lightweight UI poller survives title/session changes. Flight input stays
// in InputManager and is sampled exactly once by the game frame, as before.
export class ControllerUI {
    constructor(ui, getSession, getSettings) {
        this.ui = ui;
        this.root = ui.root;
        this.getSession = getSession;
        this.getSettings = getSettings;
        this.buttons = new Uint8Array(64);
        this.rising = new Uint8Array(64);
        this.armed = false;
        this.onPointer = () => this.clearFocus();
        this.root.addEventListener('pointerdown', this.onPointer, { passive: true });
        this.root.addEventListener('keydown', this.onPointer);
        this.onBlur = () => { this.cancelBinding(t('Assignment cancelled.')); this.armed = false; this.buttons.fill(0); };
        this.onBindingKey = event => {
            if (event.key === 'Escape' && (this.bindingCapture || this.bindingTest)) {
                event.preventDefault();event.stopImmediatePropagation();this.cancelBinding(t('Assignment cancelled.'));
            }
        };
        window.addEventListener('keydown', this.onBindingKey, true);
        window.addEventListener('blur', this.onBlur);
        this.tick = this.tick.bind(this);
        this.frame = requestAnimationFrame(this.tick);
    }
    get blocksFlight() {
        return Boolean(this.bindingCapture || this.bindingTest) || visible(this.ui.planetTransitOverlay) || visible(this.root.querySelector('#loading-screen'));
    }
    startBinding(context, action) {
        this.cancelBinding('');
        this.bindingCapture={context,action,ready:false,padId:undefined};
        this.armed=false;
        this.ui.renderControllerBindings();
        const button=this.root.querySelector(`[data-ui-command="controller-bind"][data-binding-context="${context}"][data-binding-action="${action}"]`);
        if(button){button.textContent=t('Press a button…');button.classList.add('is-capturing');this.focus(button);}
        this.ui.controllerBindingStatus(t('Release all buttons, then press the button to assign. Esc cancels.'));
    }
    cancelBinding(message='') {
        if(!this.bindingCapture&&!this.bindingTest)return;
        const {context,action}=this.bindingCapture??{};
        this.bindingCapture=undefined;this.bindingTest=false;this.armed=false;
        this.ui.renderControllerBindings?.();
        if(message)this.ui.controllerBindingStatus?.(message);
        const button=context?this.root.querySelector(`[data-ui-command="controller-bind"][data-binding-context="${context}"][data-binding-action="${action}"]`):this.root.querySelector('[data-ui-command="controller-binding-test"]');
        if(visible(button))this.focus(button);
    }
    startButtonTest() {
        this.cancelBinding('');this.bindingTest=true;this.testReady=false;this.armed=false;
        this.ui.renderControllerBindings();
        this.ui.controllerBindingStatus(t('Press buttons to test. Back or Esc ends the test.'));
    }
    clearFocus() {
        this.focused?.classList.remove('controller-focus');
        this.focused = undefined;
    }
    focus(element) {
        if (!element) return;
        this.clearFocus();
        this.focused = element;
        element.classList.add('controller-focus');
        element.focus({ preventScroll: true });
        element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
    scope() {
        if (visible(this.root.querySelector('#loading-screen'))) return this.root.querySelector('#loading-screen');
        if (visible(this.ui.planetTransitOverlay)) return this.ui.planetTransitOverlay;
        const skip = this.root.querySelector('.concourse-landing-skip');
        if (visible(skip)) return skip;
        const session = this.getSession();
        if (session && !session.save.player.dockedAt && !this.ui.isModalOpen && !session.arena?.observer) return undefined;
        for (const selector of PANELS) {
            const panel = this.root.querySelector(selector);
            if (visible(panel)) return panel;
        }
        return undefined;
    }
    candidates(scope) {
        const elements = [...scope.querySelectorAll(CONTROLS)];
        if (scope.matches(CONTROLS)) elements.unshift(scope);
        return elements.filter(element => {
            if (!visible(element) || element.matches(':disabled, [aria-disabled="true"]') || element.tabIndex < 0 || element.type === 'hidden') return false;
            const details = element.closest('details:not([open])');
            return !details || element === details.querySelector('summary');
        });
    }
    adjust(element, direction) {
        if (element?.matches('input[type="range"], input[type="number"]')) {
            const step = Number(element.step) || 1;
            const value = Number(element.value) + direction * step;
            element.value = String(Math.max(element.min === '' ? -Infinity : Number(element.min), Math.min(element.max === '' ? Infinity : Number(element.max), value)));
        } else if (element?.matches('select')) {
            const options = [...element.options].filter(option => !option.disabled);
            const index = options.indexOf(element.selectedOptions[0]);
            element.value = options[(index + direction + options.length) % options.length]?.value ?? element.value;
        } else return false;
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    }
    move(scope, dx, dy) {
        const elements = this.candidates(scope);
        const current = elements.includes(this.focused) ? this.focused : undefined;
        if (!current) { this.focus(elements[0]); return; }
        if (dx && this.adjust(current, dx)) return;
        const origin = current.getBoundingClientRect();
        const ox = origin.left + origin.width / 2, oy = origin.top + origin.height / 2;
        let best, score = Infinity;
        for (const element of elements) {
            if (element === current) continue;
            const rect = element.getBoundingClientRect();
            const x = rect.left + rect.width / 2 - ox, y = rect.top + rect.height / 2 - oy;
            const forward = x * dx + y * dy;
            if (forward < 2) continue;
            const lateral = Math.abs(x * dy - y * dx);
            const candidate = forward + lateral * 2;
            if (candidate < score) { score = candidate; best = element; }
        }
        // Linear fallback reaches even layouts with coincident anchors/long lists.
        this.focus(best ?? elements[(elements.indexOf(current) + (dx + dy > 0 ? 1 : -1) + elements.length) % elements.length]);
    }
    back(scope) {
        const skip = scope.matches('.concourse-landing-skip') ? scope : scope.querySelector('.planet-transit-skip, .concourse-landing-skip');
        if (visible(skip)) { skip.click(); return; }
        const open = this.focused?.closest('details[open]');
        if (open) { open.open = false; this.focus(open.querySelector('summary')); return; }
        for (const command of BACK) {
            const button = scope.querySelector(`[data-ui-command="${command}"]`);
            if (visible(button)) { button.click(); return; }
        }
        const back = scope.querySelector('[data-dialogue-action="back"], .dock-back-button, [data-dock-tab="concourse"]');
        if (visible(back)) back.click();
    }
    tab(scope, direction) {
        const tabs = [...scope.querySelectorAll('[role="tab"], [data-dock-tab]')].filter(visible);
        if (!tabs.length) { this.move(scope, direction, 0); return; }
        const index = Math.max(0, tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true' || tab.classList.contains('is-active')));
        const next = tabs[(index + direction + tabs.length) % tabs.length];
        next.click();
        this.focus(next);
    }
    scroll(scope, amount) {
        let node = this.focused?.parentElement;
        while (node && scope.contains(node)) {
            if (node.scrollHeight > node.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(node).overflowY)) {
                node.scrollTop += amount;
                return;
            }
            node = node.parentElement;
        }
        // Fallback when focus sits outside any scroller: the menus' scrolling
        // panes, detail panes first so the stick reads what was selected.
        for (const node of scope.querySelectorAll('.inventory-detail-scroll, .mission-dossier-scroll, .trade-overview, .ship-sheet-scroll, .paint-controls, .sx-scroll, .guild-board, .ship-console-body, .adventure-dialogue, .modal-card, .settings-content')) {
            if (visible(node) && node.scrollHeight > node.clientHeight + 4) { node.scrollTop += amount; return; }
        }
    }
    tick(now) {
        this.frame = requestAnimationFrame(this.tick);
        if (now - (this.lastPoll ?? 0) < 32 || document.hidden) return;
        this.lastPoll = now;
        const pad = connectedGamepad(this.padIndex);
        if (!pad) {
            if(this.bindingCapture?.padId||this.bindingTest)this.cancelBinding(t('Controller disconnected. Assignment cancelled.'));
            this.armed = false;
            this.padIndex = this.padId = undefined;
            this.clearFocus();
        }
        const scope = this.scope();
        const status = this.root.querySelector('[data-controller-status]');
        const statusText = pad ? t('Controller connected') : t('Connect a controller and press a button.');
        if (status && status.textContent !== statusText) status.textContent = statusText;
        if (scope !== this.lastScope || pad?.index !== this.padIndex || pad?.id !== this.padId) {
            this.clearFocus();
            this.lastScope = scope;
            this.armed = false;
            this.repeatAt = 0;
        }
        this.padIndex = pad?.index;
        this.padId = pad?.id;
        const editor=this.root.querySelector('[data-controller-bindings]');
        if((this.bindingCapture||this.bindingTest) && (!visible(editor) || scope?.id!=='pause-panel'))this.cancelBinding('');
        if (!pad || !scope) return;
        const settings=this.getSettings();
        const M=settings?.controllerBindings?.menus??DEFAULT_MENU;
        if(M!==this.menuBindings){this.menuBindings=M;this.armed=false;}
        const deadzone = settings?.controllerDeadzone ?? 0.13;
        let anyEdge=false,downCount=0,edgeCount=0,lastEdge=-1;
        for (let i = 0; i < 64; i++) {
            const down = padButton(pad, i);
            this.rising[i]=down&&!this.buttons[i]?1:0;
            if(this.rising[i]){anyEdge=true;edgeCount++;lastEdge=i;}
            if(down)downCount++;
            this.buttons[i] = down ? 1 : 0;
        }
        if(visible(editor)){
            const labels=[];
            for(let i=0;i<64;i++)if(this.buttons[i])labels.push(CONTROLLER_BUTTON_LABELS[i]??t('Button {number}',{number:i}));
            const live=editor.querySelector('[data-controller-live]');
            const text=labels.join(' + ')||t('Press a button to test its assignment.');
            if(live&&live.textContent!==text)live.textContent=text;
            editor.querySelectorAll('[data-controller-button]').forEach(row=>row.classList.toggle('is-pressed',row.dataset.controllerButton!==''&&Boolean(this.buttons[Number(row.dataset.controllerButton)])));
        }
        if(this.bindingTest){
            if(!downCount)this.testReady=true;
            if(this.testReady&&(this.rising[M.back]||M.pauseBack!==null&&this.rising[M.pauseBack]))this.cancelBinding(t('Button test ended.'));
            return;
        }
        if(this.bindingCapture){
            const capture=this.bindingCapture;
            const identity=`${pad.index}:${pad.id}`;
            if(capture.padId&&capture.padId!==identity){this.cancelBinding(t('Controller changed. Assignment cancelled.'));return;}
            capture.padId=identity;
            if(!downCount)capture.ready=true;
            if(capture.ready&&edgeCount===1){
                if(this.ui.assignControllerBinding(capture.context,capture.action,lastEdge)){
                    this.bindingCapture=undefined;this.armed=false;
                    this.ui.renderControllerBindings();
                    const button=this.root.querySelector(`[data-ui-command="controller-bind"][data-binding-action="${capture.action}"]`);
                    if(visible(button))this.focus(button);
                }else capture.ready=false;
            }else if(capture.ready&&edgeCount>1){capture.ready=false;this.ui.controllerBindingStatus(t('Press one button at a time.'));}
            return;
        }
        if (!this.armed) {
            if (padNeutral(pad, deadzone)) { this.armed = true; this.buttons.fill(0); }
            return;
        }
        const held = action => M[action] !== null && Boolean(this.buttons[M[action]]);
        const edge = action => M[action] !== null && Boolean(this.rising[M[action]]);
        const x = padAxis(pad, 0, Math.max(0.35, deadzone)), y = padAxis(pad, 1, Math.max(0.35, deadzone));
        const dx = held('right') ? 1 : held('left') ? -1 : Math.abs(x) > Math.abs(y) ? Math.sign(x) : 0;
        const dy = held('down') ? 1 : held('up') ? -1 : !dx ? Math.sign(y) : 0;
        const direction = dx + dy * 3;
        const active = anyEdge || direction || Math.abs(padAxis(pad, 3, 0.3));
        if (active && (!visible(this.focused) || !scope.contains(this.focused) || document.activeElement !== this.focused)) {
            const candidates = this.candidates(scope);
            // Dialogues and confirmation panels already choose an accessible
            // initial focus. Honour it instead of silently activating Close.
            const existing = candidates.includes(document.activeElement) ? document.activeElement : undefined;
            this.focus(existing ?? candidates.find(element => element.matches('.title-actions button, [data-ui-command="confirm-new-career"]')) ?? candidates[0]);
        }
        if (edge('nextControl')) {
            const candidates = this.candidates(scope);
            this.focus(candidates[(candidates.indexOf(this.focused) + 1) % candidates.length]);
            return;
        }
        if (scope.id === 'observer-panel' && edge('pauseBack')) {
            scope.querySelector('[data-ui-command="observer-toggle-pause"]')?.click();
            return;
        }
        if (edge('back') || edge('pauseBack')) { this.back(scope); return; }
        if (edge('previousTab')) { this.tab(scope, -1); return; }
        if (edge('nextTab')) { this.tab(scope, 1); return; }
        if (direction && (direction !== this.lastDirection || now >= this.repeatAt)) {
            this.move(scope, dx, dy);
            this.repeatAt = now + (direction !== this.lastDirection ? 340 : 120);
        }
        this.lastDirection = direction;
        if (edge('confirm')) {
            if (visible(this.focused) && scope.contains(this.focused)) {
                if (!this.adjust(this.focused, 1)) this.focused.click();
            }
            // A click can synchronously replace a panel with the next panel.
            // Require release even when both happen to reuse the same element.
            this.armed = false;
        }
        const scroll = padAxis(pad, 3, 0.3) + (held('scrollDown') ? 1 : 0) - (held('scrollUp') ? 1 : 0);
        if (scroll) this.scroll(scope, scroll * 22);
    }
    dispose() {
        cancelAnimationFrame(this.frame);
        this.clearFocus();
        this.root.removeEventListener('pointerdown', this.onPointer);
        this.root.removeEventListener('keydown', this.onPointer);
        window.removeEventListener('blur', this.onBlur);
        window.removeEventListener('keydown', this.onBindingKey, true);
    }
}
