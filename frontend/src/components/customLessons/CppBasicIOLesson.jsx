/**
 * CppBasicIOLesson — teaching lesson: Basic Input & Output.
 * component_key suggestion: cpp-basic-io
 */
import { Keyboard, Lightbulb, AlertTriangle, Target } from 'lucide-react';

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

export default function CppBasicIOLesson({ student, lesson }) {
  const firstName = (student?.name || 'there').split(' ')[0];

  const outCode = `std::cout << "Score: " << 42 << std::endl;
// You can chain multiple things with <<`;

  const inCode = `#include <iostream>

int main() {
    std::string name;
    int age;

    std::cout << "What is your name? ";
    std::cin >> name;

    std::cout << "How old are you? ";
    std::cin >> age;

    std::cout << "Hello, " << name << "! You are " << age << " years old.\\n";
    return 0;
}`;

  return (
    <article className="max-w-3xl mx-auto py-8 px-4 sm:px-6 space-y-10">
      <header className="space-y-4 pb-8 border-b border-border">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          <Keyboard className="h-3.5 w-3.5" /> Lesson · Input & Output
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">Basic Input & Output</h1>
        <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
          {firstName}, so far your programs have only talked to you — now let's make them
          listen. This is the point where your programs stop being static and start reacting
          to whatever the user types.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Output You Already Know</h2>
        <p className="leading-relaxed text-foreground/90">
          You've used <code className="px-1 rounded bg-muted font-mono text-xs">std::cout</code> already.
          You can chain several values with more <code className="px-1 rounded bg-muted font-mono text-xs">{'<<'}</code> in
          a row, mixing text and variables freely:
        </p>
        <CodeBlock code={outCode} />
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Reading Input With cin</h2>
        <p className="leading-relaxed text-foreground/90">
          <code className="px-1 rounded bg-muted font-mono text-xs">std::cin</code> is the mirror image
          of <code className="px-1 rounded bg-muted font-mono text-xs">std::cout</code> — instead of{' '}
          <code className="px-1 rounded bg-muted font-mono text-xs">{'<<'}</code> sending data out, you use{' '}
          <code className="px-1 rounded bg-muted font-mono text-xs">{'>>'}</code> to pull data in, straight into
          a variable:
        </p>
        <CodeBlock code={inCode} highlightLines={[8, 11]} />
        <p className="leading-relaxed text-foreground/90">
          Run this, and the program pauses at each <code className="px-1 rounded bg-muted font-mono text-xs">std::cin</code> line,
          waiting for you to type something and press Enter.
        </p>
      </section>

      <Callout icon={AlertTriangle} tone="warning" title="cin stops at the first space">
        <p>
          <code className="px-1 rounded bg-muted/60 font-mono text-xs">std::cin {'>>'} name</code> reads
          only up to the first space or Enter. Type "Kwame Mensah" and{' '}
          <code className="px-1 rounded bg-muted/60 font-mono text-xs">name</code> will only capture
          "Kwame" — the rest gets left behind for the next read. You'll learn a fix for reading
          full lines (<code className="px-1 rounded bg-muted/60 font-mono text-xs">std::getline</code>) later
          — for now, just know single words are safe with{' '}
          <code className="px-1 rounded bg-muted/60 font-mono text-xs">cin</code>.
        </p>
      </Callout>

      <Callout icon={Lightbulb} title="Prompt before you read">
        <p>
          Always print a message with <code className="px-1 rounded bg-muted/60 font-mono text-xs">std::cout</code> right
          before a <code className="px-1 rounded bg-muted/60 font-mono text-xs">std::cin</code> line. Without a prompt,
          the user has no idea the program is waiting for them — it just looks frozen.
        </p>
      </Callout>

      <Callout icon={Target} tone="success" title="Try It Yourself">
        <p>
          Write a program that asks for the user's favorite number, reads it into an{' '}
          <code className="px-1 rounded bg-muted/60 font-mono text-xs">int</code>, then prints that number
          doubled and that number squared.
        </p>
      </Callout>

      <section className="rounded-xl border border-border bg-muted/30 p-6 sm:p-8 text-center space-y-3">
        <h3 className="text-xl font-bold">You're ready, {firstName}.</h3>
        <p className="text-sm text-muted-foreground max-w-prose mx-auto leading-relaxed">
          You now have every ingredient for a real interactive program — variables, types,
          operators, and I/O. Next lesson: put them all together in a guided calculator exercise.
        </p>
      </section>
    </article>
  );
}
