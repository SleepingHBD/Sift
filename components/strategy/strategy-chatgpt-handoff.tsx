import {
  Check,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileJson,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import { Badge, Button } from "@/components/ui/primitives";

export function StrategyChatGptHandoff({
  prompt,
  sourceCount,
  response,
  copied,
  status,
  error,
  onCopy,
  onResponseChange,
  onSave,
}: {
  prompt: string;
  sourceCount: number;
  response: string;
  copied: boolean;
  status: "idle" | "saving" | "saved" | "error";
  error: string;
  onCopy: () => void;
  onResponseChange: (value: string) => void;
  onSave: () => void;
}) {
  return (
    <section className="strategy-handoff" aria-labelledby="strategy-handoff-heading">
      <header className="strategy-handoff__head">
        <span className="ai-orb"><ClipboardCheck size={19} /></span>
        <div>
          <Badge>No API billing</Badge>
          <h2 id="strategy-handoff-heading">Take this evidence into ChatGPT.</h2>
          <p>Sift has prepared one visible prompt from the {sourceCount} source{sourceCount === 1 ? "" : "s"} you selected. Nothing is sent automatically.</p>
        </div>
        <span className="strategy-handoff__mode"><ShieldCheck size={13} />Manual handoff</span>
      </header>

      <div className="strategy-handoff__steps">
        <section className="strategy-handoff__step">
          <span className="strategy-handoff__number">1</span>
          <div className="strategy-handoff__step-body">
            <p className="eyebrow">Copy from Sift</p>
            <h3>Copy the evidence prompt</h3>
            <p>The prompt includes your question, the exact selected source IDs, citation rules, and the response format Sift can validate.</p>
            <div className="strategy-handoff__actions">
              <Button variant="dark" onClick={onCopy}>{copied ? <><Check size={15} />Copied</> : <><Copy size={15} />Copy prompt</>}</Button>
              <a className="ui-button ui-button--secondary ui-button--md" href="https://chatgpt.com/" target="_blank" rel="noreferrer">Open ChatGPT <ExternalLink size={14} /></a>
            </div>
            <details className="strategy-handoff__preview">
              <summary>Review exactly what will be copied</summary>
              <pre>{prompt}</pre>
            </details>
          </div>
        </section>

        <section className="strategy-handoff__step">
          <span className="strategy-handoff__number">2</span>
          <div className="strategy-handoff__step-body">
            <p className="eyebrow">Think in ChatGPT</p>
            <h3>Paste the prompt and run it</h3>
            <p>Use your existing ChatGPT account. The response arrives as JSON so Sift can verify it, then Sift turns it into a plain-language strategist answer.</p>
            <div className="strategy-handoff__notice"><ShieldCheck size={15} /><span>Do not paste passwords, API keys, private credentials, or evidence you do not want processed in ChatGPT.</span></div>
          </div>
        </section>

        <section className="strategy-handoff__step strategy-handoff__step--response">
          <span className="strategy-handoff__number">3</span>
          <div className="strategy-handoff__step-body">
            <p className="eyebrow">Return to Sift</p>
            <h3>Paste the ChatGPT response</h3>
            <p>Sift verifies the source links and then presents the answer in a readable order: direct answer, meaning, evidence, uncertainty, and next steps.</p>
            <label className="strategy-handoff__response">
              <span>ChatGPT response · JSON</span>
              <textarea
                rows={12}
                value={response}
                onChange={(event) => onResponseChange(event.target.value)}
                placeholder={'Paste the response beginning with { "summary": ... }'}
                spellCheck={false}
              />
            </label>
            {error ? <p className="strategy-handoff__error" role="alert">{error}</p> : null}
            {status === "saved" ? <div className="strategy-handoff__saved"><Check size={15} /><span>Validated and saved to your project with its evidence trail.</span></div> : null}
            <Button variant="dark" disabled={!response.trim() || status === "saving" || status === "saved"} onClick={onSave}>
              {status === "saving" ? <><LoaderCircle className="spin" size={15} />Validating and saving…</> : <><FileJson size={15} />Validate and save analysis</>}
            </Button>
          </div>
        </section>
      </div>
    </section>
  );
}
