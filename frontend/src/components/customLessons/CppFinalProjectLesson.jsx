/**
 * CppFinalProjectLesson — capstone: Number Guessing Game.
 * component_key suggestion: cpp-final-project-guessing-game
 */
import { Gamepad2, ListChecks, Lightbulb, Trophy } from 'lucide-react';

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

export default function CppFinalProjectLesson({ student, lesson }) {
  const firstName = (student?.name || 'there').split(' ')[0];

  const starterCode = `#include <iostream>
#include <cstdlib>   // for rand()
#include <ctime>      // for time()

int main() {
    std::srand(std::time(0));           // seed randomness
    int secret = std::rand() % 100 + 1; // random number 1–100
    int guess;
    int attempts = 0;

    std::cout << "I'm thinking of a number between 1 and 100.\\n";

    // TODO: loop until the user guesses correctly
    //  - read a guess
    //  - increment attempts
    //  - tell them "too high", "too low", or "correct!"
    //  - stop the loop once they get it right

    std::cout << "You got it in " << attempts << " tries!\\n";
    return 0;
}`;

  return (
    <article className="max-w-3xl mx-auto py-8 px-4 sm:px-6 space-y-10">
      <header className="space-y-4 pb-8 border-b border-border">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          <Gamepad2 className="h-3.5 w-3.5" /> Final Project
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">Number Guessing Game</h1>
        <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
          {firstName}, this is it — the project that pulls together everything from this course:
          variables, I/O, conditionals, and loops. When you finish this, you'll have written a
          real, playable game entirely on your own.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2"><ListChecks className="h-5 w-5 text-primary" /> The Spec</h2>
        <ul className="space-y-2 text-sm text-foreground/90">
          <li className="flex gap-2"><span className="text-primary font-bold shrink-0">•</span>The program picks a random number between 1 and 100.</li>
          <li className="flex gap-2"><span className="text-primary font-bold shrink-0">•</span>The player repeatedly guesses; after each guess, the program says "too high," "too low," or "correct!"</li>
          <li className="flex gap-2"><span className="text-primary font-bold shrink-0">•</span>The loop stops once the guess is correct.</li>
          <li className="flex gap-2"><span className="text-primary font-bold shrink-0">•</span>At the end, print how many attempts it took.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Starter Code</h2>
        <p className="leading-relaxed text-foreground/90">
          You haven't formally covered <code className="px-1 rounded bg-muted font-mono text-xs">while</code> loops
          in a reading lesson yet — that's intentional, it was in the video lesson right before this
          one. Here's the shape you're filling in; the loop logic is your job:
        </p>
        <CodeBlock code={starterCode} highlightLines={[16, 17, 18, 19, 20]} />
      </section>

      <Callout icon={Lightbulb} title="Hints, if you're stuck">
        <p>Try this structure for the missing loop:</p>
        <ol className="list-decimal list-inside space-y-1 mt-2">
          <li>Use a <code className="px-1 rounded bg-muted/60 font-mono text-xs">while (true)</code> loop that runs forever...</li>
          <li>...read a guess with <code className="px-1 rounded bg-muted/60 font-mono text-xs">std::cin {'>>'} guess;</code></li>
          <li>...increment <code className="px-1 rounded bg-muted/60 font-mono text-xs">attempts</code></li>
          <li>...compare <code className="px-1 rounded bg-muted/60 font-mono text-xs">guess</code> to{' '}
            <code className="px-1 rounded bg-muted/60 font-mono text-xs">secret</code> with if/else if/else</li>
          <li>...when it's correct, use <code className="px-1 rounded bg-muted/60 font-mono text-xs">break;</code> to exit the loop</li>
        </ol>
      </Callout>

      <Callout icon={Trophy} tone="success" title="Push Yourself Further (optional)">
        <p>Once the basic version works, try adding:</p>
        <ul className="list-disc list-inside space-y-1 mt-2">
          <li>A maximum of 7 attempts, after which the game reveals the number and ends</li>
          <li>A "play again?" prompt that restarts the game with a new random number</li>
          <li>Input validation — what happens if the user types a letter instead of a number?</li>
        </ul>
      </Callout>

      <section className="rounded-xl border border-primary/30 bg-primary/5 p-6 sm:p-8 text-center space-y-3">
        <h3 className="text-xl font-bold">You built this yourself, {firstName}.</h3>
        <p className="text-sm text-muted-foreground max-w-prose mx-auto leading-relaxed">
          Once your game runs correctly, head to the Final Exam. Passing it earns your Beginner
          certificate — and the Intermediate track picks up right where this one leaves off.
        </p>
      </section>
    </article>
  );
}
