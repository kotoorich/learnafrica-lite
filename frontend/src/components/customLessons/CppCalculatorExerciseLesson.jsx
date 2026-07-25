/**
 * CppCalculatorExerciseLesson — guided practice combining variables + operators + I/O.
 * component_key suggestion: cpp-calculator-exercise
 */
import { Wrench, Target, CheckCircle2, Eye } from 'lucide-react';
import { useState } from 'react';

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

export default function CppCalculatorExerciseLesson({ student, lesson }) {
  const firstName = (student?.name || 'there').split(' ')[0];
  const [revealed, setRevealed] = useState(false);

  const solution = `#include <iostream>

int main() {
    double num1, num2;
    char op;

    std::cout << "Enter first number: ";
    std::cin >> num1;

    std::cout << "Enter an operator (+, -, *, /): ";
    std::cin >> op;

    std::cout << "Enter second number: ";
    std::cin >> num2;

    double result;
    if (op == '+') result = num1 + num2;
    else if (op == '-') result = num1 - num2;
    else if (op == '*') result = num1 * num2;
    else if (op == '/') result = num1 / num2;
    else {
        std::cout << "Unknown operator.\\n";
        return 1;
    }

    std::cout << num1 << " " << op << " " << num2 << " = " << result << std::endl;
    return 0;
}`;

  return (
    <article className="max-w-3xl mx-auto py-8 px-4 sm:px-6 space-y-10">
      <header className="space-y-4 pb-8 border-b border-border">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          <Wrench className="h-3.5 w-3.5" /> Guided Exercise
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">Build a Calculator</h1>
        <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
          {firstName}, this is the first lesson with no new concepts — just you, combining
          everything from the last three lessons into one working program. That's exactly how
          real programming feels: less "learn a new thing," more "connect things you already know."
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2"><Target className="h-5 w-5 text-primary" /> The Goal</h2>
        <p className="leading-relaxed text-foreground/90">
          Build a program that asks the user for two numbers and an operator symbol
          (<code className="px-1 rounded bg-muted font-mono text-xs">+</code>,{' '}
          <code className="px-1 rounded bg-muted font-mono text-xs">-</code>,{' '}
          <code className="px-1 rounded bg-muted font-mono text-xs">*</code>, or{' '}
          <code className="px-1 rounded bg-muted font-mono text-xs">/</code>), then prints the result.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Step by Step</h2>
        <ol className="space-y-3 text-sm text-foreground/90">
          <li className="flex gap-3"><span className="shrink-0 h-6 w-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">1</span>Declare two <code className="px-1 rounded bg-muted font-mono text-xs">double</code> variables for the numbers, and one <code className="px-1 rounded bg-muted font-mono text-xs">char</code> for the operator.</li>
          <li className="flex gap-3"><span className="shrink-0 h-6 w-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">2</span>Prompt for and read the first number with cout/cin.</li>
          <li className="flex gap-3"><span className="shrink-0 h-6 w-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">3</span>Prompt for and read the operator character.</li>
          <li className="flex gap-3"><span className="shrink-0 h-6 w-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">4</span>Prompt for and read the second number.</li>
          <li className="flex gap-3"><span className="shrink-0 h-6 w-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">5</span>Use if / else if to check which operator was entered, and compute the result. (You'll cover if/else properly in the next lesson — for this exercise, a chain of if/else if statements comparing the char is enough; the solution shows exactly how.)</li>
          <li className="flex gap-3"><span className="shrink-0 h-6 w-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">6</span>Print the full equation and result.</li>
        </ol>
      </section>

      <p className="text-sm text-muted-foreground italic">
        Go try this now before looking at the solution below — even a half-working attempt
        teaches you more than reading the answer first.
      </p>

      {!revealed ? (
        <button
          onClick={() => setRevealed(true)}
          className="w-full rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition-colors p-6 flex items-center justify-center gap-2 text-primary font-bold"
        >
          <Eye className="h-4 w-4" /> Reveal the Solution
        </button>
      ) : (
        <section className="space-y-4">
          <h2 className="text-2xl font-bold flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-success" /> One Working Solution</h2>
          <p className="text-sm text-muted-foreground">
            There's more than one correct way to write this — if yours works differently but
            gives the right output, that's just as valid.
          </p>
          <CodeBlock code={solution} highlightLines={[18, 19, 20, 21]} />
        </section>
      )}

      <section className="rounded-xl border border-border bg-muted/30 p-6 sm:p-8 text-center space-y-3">
        <h3 className="text-xl font-bold">Nicely done, {firstName}.</h3>
        <p className="text-sm text-muted-foreground max-w-prose mx-auto leading-relaxed">
          The next lesson teaches if/else properly — you already used it above by feel; now
          you'll understand exactly why it works.
        </p>
      </section>
    </article>
  );
}
