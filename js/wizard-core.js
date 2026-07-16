/**
 * wizard-core.js — PURE wizard state machine (no DOM, no storage).
 *
 * Powers every Budget-C guided flow (Master Plan Part 5.3): one question
 * per screen, validated Next, Back, skip-aware progress, resumable.
 * WizardShell (wizard.js) is the DOM layer; this file is fully
 * Node-testable with zero mocks.
 *
 * Definition shape:
 *   { id, version, steps: [{ id, prompt, type: 'choice'|'text'|'number'|'custom',
 *       choices?: [{value,label,desc?}], optional?: bool,
 *       validate?: fn(answer, answers) -> null | 'error text',
 *       skip?: fn(answers) -> bool }] }
 *
 * State is immutable: every transition returns a NEW state object
 *   { defId, defVersion, index, answers }
 */

var WizardCore = {

    create: function (def) {
        return {
            defId: def.id,
            defVersion: def.version,
            index: WizardCore._firstVisible(def, {}, 0),
            answers: {}
        };
    },

    /** First non-skipped step index at or after `from` (or steps.length). */
    _firstVisible: function (def, answers, from) {
        var i = from;
        while (i < def.steps.length && def.steps[i].skip && def.steps[i].skip(answers)) i++;
        return i;
    },

    /** Last non-skipped step index at or before `from` (or -1). */
    _lastVisible: function (def, answers, from) {
        var i = from;
        while (i >= 0 && def.steps[i].skip && def.steps[i].skip(answers)) i--;
        return i;
    },

    /**
     * May the user advance with this answer?
     * → {ok:true} | {ok:false, error}
     */
    canNext: function (def, state, answer) {
        var step = def.steps[state.index];
        if (!step) return { ok: false, error: 'No current step.' };
        var empty = answer === undefined || answer === null || answer === '';
        if (empty && !step.optional) {
            return { ok: false, error: 'An answer is required.' };
        }
        if (!empty && step.validate) {
            var err = step.validate(answer, state.answers);
            if (err) return { ok: false, error: err };
        }
        return { ok: true };
    },

    /**
     * Record the answer and advance past any skipped steps.
     * Returns state unchanged if canNext fails.
     */
    next: function (def, state, answer) {
        if (!WizardCore.canNext(def, state, answer).ok) return state;
        var step = def.steps[state.index];
        var answers = {};
        for (var k in state.answers) {
            if (state.answers.hasOwnProperty(k)) answers[k] = state.answers[k];
        }
        if (answer !== undefined && answer !== null && answer !== '') {
            answers[step.id] = answer;
        }
        return {
            defId: state.defId,
            defVersion: state.defVersion,
            index: WizardCore._firstVisible(def, answers, state.index + 1),
            answers: answers
        };
    },

    /** Rewind past skipped steps; no-op at the first visible step. */
    back: function (def, state) {
        var prev = WizardCore._lastVisible(def, state.answers, state.index - 1);
        if (prev < 0) return state;
        return {
            defId: state.defId,
            defVersion: state.defVersion,
            index: prev,
            answers: state.answers
        };
    },

    isComplete: function (def, state) {
        return state.index >= def.steps.length;
    },

    /** Skip-aware progress: {current, total, fraction}. */
    progress: function (def, state) {
        var total = 0;
        var current = 0;
        for (var i = 0; i < def.steps.length; i++) {
            var skipped = def.steps[i].skip && def.steps[i].skip(state.answers);
            if (skipped) continue;
            total++;
            if (i <= state.index) current++;
        }
        if (WizardCore.isComplete(def, state)) current = total;
        return {
            current: Math.min(current, total),
            total: total,
            fraction: total ? Math.min(current, total) / total : 1
        };
    },

    /** Persistable JSON (localStorage 'wizard_<defId>'). */
    serialize: function (state) {
        return {
            v: 1,
            defVersion: state.defVersion,
            index: state.index,
            answers: state.answers,
            updatedAt: new Date().toISOString()
        };
    },

    /**
     * Restore saved state; a shipped wizard change can never strand a
     * user — version mismatch or unknown answer ids → fresh state.
     */
    hydrate: function (def, saved) {
        if (!saved || saved.v !== 1 || saved.defVersion !== def.version) {
            return WizardCore.create(def);
        }
        var stepIds = {};
        for (var i = 0; i < def.steps.length; i++) stepIds[def.steps[i].id] = true;
        for (var key in saved.answers) {
            if (saved.answers.hasOwnProperty(key) && !stepIds[key]) {
                return WizardCore.create(def);
            }
        }
        var index = typeof saved.index === 'number'
            ? Math.max(0, Math.min(saved.index, def.steps.length)) : 0;
        return {
            defId: def.id,
            defVersion: def.version,
            index: index,
            answers: saved.answers || {}
        };
    }
};

// Export for Node unit tests
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WizardCore;
}
