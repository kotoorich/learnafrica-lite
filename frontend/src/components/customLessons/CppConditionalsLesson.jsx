/**
 * CppConditionalsLesson — teaching lesson: Control Structures I (Conditionals).
 * component_key suggestion: cpp-conditionals
 */
import { GitBranch, Lightbulb, Target } from 'lucide-react';

function CodeBlock({ code, highlightLines = [] }) {
  const lines = code.trim().split('\n');
  return (
    <div className="rounded-xl overflow-hidden border border-border bg-slate-950 my-4 shadow-sm">
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500/70" /><span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" /><span className="h-2.5 w-2.5 rounded-full bg-green-500/70" /></div>
        <span className="text-[11px] font-mono text-slate-400 ml-2">main.cpp</span>
      </div>
      <pre className="p-4 overflow-x-auto text-[13px] leading-relaxed">
        <code className="font-mono">
          {lines.map((line, i) => (
            <div key={i} className={highlightLines.includes(i + 1) ? 'bg-primary/10 -mx-4 px-4 border-l-2 border-primary text-slate-100' : 'text-slate-300'}>
              <span className="inline-block w-6 text-slate-600 select-none">{i + 1}</span>{line || ' '}
            </div>
          ))}
        </code>
      </pre>
    </div>
  );
}

function Callout({ icon: Icon, tone = 'primary', title, children }) {
  const tones = { primary: 'border-primary/30 bg-primary/5 text-primary', warning: 'border-warning/30 bg-warning/5 text-warning', success: 'border-success/30 bg-success/5 text-success' };
  return (
    <aside className={`rounded-xl border p-5 my-5 ${tones[tone]}`}>
      <div className="flex items-center gap-2 mb-2"><Icon className="h-4 w-4" /><p className="font-bold">{title}</p></div>
      <div className="text-sm text-foreground/90 leading-relaxed space-y-2">{children}</div>
    </aside>
  );
}

export default function CppConditionalsLesson({ student, lesson }) {
  const firstName = (student?.name || 'there').split(' ')[0];

  const ifCode = `int score = 65;

if (score >= 70) {
    std::cout << "Pass\\n";
} else if (score >= 50) {
    std::cout << "Needs improvement\\n";
} else {
    std::cout << "Fail\\n";
}
// Output: Needs improvement`;

  const ternaryCode = `int age = 20;
std::string status = (age >= 18) ? "adult" : "minor";
// Same idea as if/else, just in a single expression`;

  const switchCode = `int day = 3;

switch (day) {
    case 1: std::cout << "Monday"; break;
    case 2: std::cout << "Tuesday"; break;
    case 3: std::cout << "Wednesday"; break;
    default: std::cout << "Unknown day";
}
// Output: Wednesday`;

  return (
    <article className="max-w-3xl mx-auto py-8 px-4 sm:px-6 space-y-10">
      <header className="space-y-4 pb-8 border-b border-border">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          <GitBranch className="h-3.5 w-3.5" /> Lesson · Conditionals
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">Making Decisions in Code</h1>
        <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
          {firstName}, every interesting program needs to react differently depending on the
          situation. You already used this by feel in the calculator exercise — now let's make
          it official.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">if / else if / else</h2>
        <p className="leading-relaxed text-foreground/90">
          The program checks each condition in order, top to bottom, and runs the first block
          whose condition is true. Once one matches, the rest are skipped entirely.
        </p>
        <CodeBlock code={ifCode} highlightLines={[3, 5, 7]} />
        <Callout icon={Lightbulb} title="Order matters">
          <p>
            If you swapped the order and checked <code className="px-1 rounded bg-muted/60 font-mono text-xs">score {'>='} 50</code> first,
            a score of 90 would still print "Needs improvement" — because that condition is also
            technically true, and it's checked first. Always order conditions from most specific
            to least specific.
          </p>
        </Callout>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">The Conditional (Ternary) Operator</h2>
        <p className="leading-relaxed text-foreground/90">
          For simple two-way choices, the ternary operator packs an if/else into one line:
        </p>
        <CodeBlock code={ternaryCode} highlightLines={[2]} />
        <p className="leading-relaxed text-foreground/90">
          Read it as: "condition ? value if true : value if false." Use it for short, simple
          choices — for anything with real logic inside, a full if/else is more readable.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">switch — Many Exact Matches</h2>
        <p className="leading-relaxed text-foreground/90">
          When you're comparing one variable against several exact values, switch is often
          cleaner than a long if/else if chain:
        </p>
        <CodeBlock code={switchCode} highlightLines={[6]} />
        <Callout icon={Lightbulb} tone="warning" title="Don't forget break">
          <p>
            Without <code className="px-1 rounded bg-muted/60 font-mono text-xs">break;</code>, execution
            "falls through" into the next case instead of stopping — a classic switch bug. The{' '}
            <code className="px-1 rounded bg-muted/60 font-mono text-xs">default</code> case runs
            when nothing else matched.
          </p>
        </Callout>
      </section>

      <Callout icon={Target} tone="success" title="Try It Yourself">
        <p>
          Write a program that reads an integer test score and prints a letter grade (A/B/C/D/F)
          using if/else if. Then rewrite the same logic using a switch statement based on{' '}
          <code className="px-1 rounded bg-muted/60 font-mono text-xs">score / 10</code>.
        </p>
      </Callout>

      <section className="rounded-xl border border-border bg-muted/30 p-6 sm:p-8 text-center space-y-3">
        <h3 className="text-xl font-bold">Solid, {firstName}.</h3>
        <p className="text-sm text-muted-foreground max-w-prose mx-auto leading-relaxed">
          Next up (as a short video): loops — how to repeat code without copy-pasting it.
        </p>
      </section>
    </article>
  );
}
