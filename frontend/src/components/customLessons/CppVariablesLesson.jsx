/**
 * CppVariablesLesson — teaching lesson: Variables (storing data).
 * component_key suggestion: cpp-variables
 */
import { Database, Lightbulb, AlertTriangle, Target } from 'lucide-react';

function CodeBlock({ code, highlightLines = [] }) {
  const lines = code.trim().split('\n');
  return (
    <div className="rounded-xl overflow-hidden border border-border bg-slate-950 my-4 shadow-sm">
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-green-500/70" />
        </div>
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

export default function CppVariablesLesson({ student, lesson }) {
  const firstName = (student?.name || 'there').split(' ')[0];

  const declareCode = `int score;        // declared, but empty/garbage for now
score = 100;      // now it holds 100

int lives = 3;    // declared AND given a value in one line`;

  const namingCode = `int studentAge = 20;      // good: clear, descriptive
int x = 20;               // works, but tells you nothing later
int 2ndPlace = 5;         // ERROR: can't start with a digit
int student-age = 20;     // ERROR: hyphens aren't allowed`;

  return (
    <article className="max-w-3xl mx-auto py-8 px-4 sm:px-6 space-y-10">
      <header className="space-y-4 pb-8 border-b border-border">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          <Database className="h-3.5 w-3.5" /> Lesson · Variables
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">Storing Data With Variables</h1>
        <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
          Hi {firstName} — a variable is just a labeled box in memory that holds a value you can
          change later. Almost nothing useful happens in a program without them, so getting
          comfortable here pays off immediately.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Declaring and Initializing</h2>
        <p className="leading-relaxed text-foreground/90">
          <strong>Declaring</strong> a variable means telling the compiler "reserve some memory
          and give it this name." <strong>Initializing</strong> means giving it a starting value
          right away. You can do these separately or together:
        </p>
        <CodeBlock code={declareCode} highlightLines={[1, 2, 4]} />
        <p className="leading-relaxed text-foreground/90">
          A variable that's declared but not initialized holds whatever garbage happened to be
          in that memory location — never assume it starts at zero. Always initialize before you
          read a variable's value.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Naming Rules</h2>
        <p className="leading-relaxed text-foreground/90">
          Names can contain letters, digits, and underscores, but can't start with a digit and
          can't contain spaces or hyphens. C++ is case-sensitive — <code className="px-1 rounded bg-muted font-mono text-xs">score</code> and{' '}
          <code className="px-1 rounded bg-muted font-mono text-xs">Score</code> are two different variables.
        </p>
        <CodeBlock code={namingCode} highlightLines={[1]} />
        <p className="leading-relaxed text-foreground/90">
          The rules only tell you what's <em>legal</em> — good naming is about what's{' '}
          <em>clear</em>. <code className="px-1 rounded bg-muted font-mono text-xs">studentAge</code> beats{' '}
          <code className="px-1 rounded bg-muted font-mono text-xs">x</code> every time once your program grows past a few lines.
        </p>
      </section>

      <Callout icon={Lightbulb} title="Scope — where a variable is 'alive'">
        <p>
          A variable declared inside a function (like inside <code className="px-1 rounded bg-muted/60 font-mono text-xs">main()</code>) only
          exists inside that function. Try to use it outside, and the compiler won't recognize
          the name. You'll go deeper on scope later, but for now: variables live and die inside
          the curly braces they were declared in.
        </p>
      </Callout>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-warning" /> Common Mistakes</h2>
        <ul className="space-y-2 text-sm text-foreground/90">
          <li className="flex gap-2"><span className="text-warning font-bold shrink-0">•</span>Using a variable before initializing it, then being confused by odd output.</li>
          <li className="flex gap-2"><span className="text-warning font-bold shrink-0">•</span>Declaring the same variable name twice in the same scope — the compiler will reject it.</li>
          <li className="flex gap-2"><span className="text-warning font-bold shrink-0">•</span>Forgetting that variable names are case-sensitive and typo-ing the case somewhere later.</li>
        </ul>
      </section>

      <Callout icon={Target} tone="success" title="Try It Yourself">
        <p>
          Write a program that declares three variables — your age, your favorite number, and
          the current year — initializes all three, then prints all three using
          <code className="px-1 rounded bg-muted/60 font-mono text-xs"> std::cout</code> statements, each on its own line.
        </p>
      </Callout>

      <section className="rounded-xl border border-border bg-muted/30 p-6 sm:p-8 text-center space-y-3">
        <h3 className="text-xl font-bold">Good work, {firstName}.</h3>
        <p className="text-sm text-muted-foreground max-w-prose mx-auto leading-relaxed">
          Next up: the different <em>types</em> of data a variable can hold — numbers, decimals,
          single characters, true/false, and text.
        </p>
      </section>
    </article>
  );
}
