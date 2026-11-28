// What a run of the daily job says: its log, the chore log's entries, what needs the commissioner
// (which fails the run, so GitHub emails them), the run's summary and league-data's chore-log.md.

import {appendFileSync, existsSync, readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";

// `onAttention` runs at each flag: the job fails the run there. `print` is the run's output.
export function runLog({onAttention = () => {}, print = (line) => console.log(line)} = {}) {
    const entries = [];
    const attention = [];
    // at the top of a dry run's summary
    const dryRunNotes = [];

    const log = (message) => print(message);

    function choreLog(message) {
        log(message);
        entries.push(message);
    }

    function needsAttention(message) {
        choreLog(message);
        attention.push(message);
        onAttention();
    }

    // a check skipped for want of an export: flagged when MFL's export has changed, as that won't pass
    const skipped = (error, message) => (error.changed ? needsAttention : log)(message);

    // the run fails on purpose so GitHub emails the commissioner; the annotation says why
    function explainFailure() {
        if (!attention.length) {
            return;
        }
        const count = attention.length === 1 ? "1 item needs" : `${attention.length} items need`;
        const text = `Failing the run so it gets noticed: ${count} the commissioner.\n${attention.map((item) => `- ${item}`).join("\n")}`;
        // workflow commands end at a newline, so it and % are escaped
        print(`::error title=Daily chores need attention::${text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}`);
    }

    // `switches`: what each chore's switch does, a line of the summary
    function writeSummary({file, dryRun, switches}) {
        if (!file) {
            return;
        }
        const outcome = attention.length ? "Needs attention" : "OK";
        const lines = entries.length ? entries.map((entry) => `- ${entry}`).join("\n") : "Nothing to do.";
        const notes = [...dryRunNotes, switches].map((note) => `${note}\n\n`).join("");
        try {
            appendFileSync(file, `## Daily chores${dryRun ? " (dry run)" : ""}: ${outcome}\n\n${notes}${lines}\n`);
        } catch (error) {
            // the summary is a convenience; the chore log already has everything
            log(`Couldn't write the run summary: ${error.message}`);
        }
    }

    // a monthly heartbeat when nothing happened; whether the file changed
    function updateChoreLog(dataDir, now) {
        const file = join(dataDir, "chore-log.md");
        const stamp = now.toISOString().slice(0, 16).replace("T", " ") + " UTC";
        let text = existsSync(file) ? readFileSync(file, "utf8") : "# Chore log\n\nWhat the daily job did, newest last.\n\n";
        if (entries.length) {
            text += entries.map((entry) => `- ${stamp}: ${entry}\n`).join("");
        } else {
            const last = [...text.matchAll(/^- (\d{4}-\d{2}-\d{2})/gm)].pop();
            const days = last ? (now - new Date(`${last[1]}T00:00:00Z`)) / 86400000 : Infinity;
            if (days < 30) {
                return false;
            }
            text += `- ${stamp}: Heartbeat. Nothing to do; the daily job is running.\n`;
        }
        writeFileSync(file, text);
        return true;
    }

    return {log, choreLog, needsAttention, skipped, entries, attention, dryRunNotes, explainFailure, writeSummary, updateChoreLog};
}
