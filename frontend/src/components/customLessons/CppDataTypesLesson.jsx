/**
 * CppDataTypesLesson — teaching lesson: Fundamental Data Types.
 * component_key suggestion: cpp-data-types
 */
import { Layers, Lightbulb, Target } from 'lucide-react';

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

export default function CppDataTypesLesson({ student, lesson }) {
  const firstName = (student?.name || 'there').split(' ')[0];

  const typesCode = `int    age = 25;             // whole numbers
float  price = 19.99f;       // decimals, less precision
double pi = 3.14159265;      // decimals, more precision
char   grade = 'A';          // a single character (single quotes!)
bool   isPassing = true;     // true or false only
std::string name = "Ama";    // text (needs #include <string>)`;

  const sizeofCode = `#include <iostream>

int main() {
    std::cout << "int: "    << sizeof(int)    << " bytes\\n";
    std::cout << "double: " << sizeof(double) << " bytes\\n";
    std::cout << "char: "   << sizeof(char)   << " bytes\\n";
    return 0;
}`;

  return (
    <article className="max-w-3xl mx-auto py-8 px-4 sm:px-6 space-y-10">
      <header className="space-y-4 pb-8 border-b border-border">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
          <Layers className="h-3.5 w-3.5" /> Lesson · Data Types
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">Fundamental Data Types</h1>
        <p className="text-base sm:text-lg text-muted-foreground leading-relaxed">
          {firstName}, every variable needs a <em>type</em> — it tells the compiler what kind of
          data to expect and how much memory to set aside. Picking the right type isn't just a
          formality; it prevents whole categories of bugs.
        </p>
      </header>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">The Types You'll Use Constantly</h2>
        <CodeBlock code={typesCode} />
        <p className="leading-relaxed text-foreground/90">
          Notice <code className="px-1 rounded bg-muted font-mono text-xs">char</code> uses single
          quotes for a single character, while <code className="px-1 rounded bg-muted font-mono text-xs">std::string</code> uses
          double quotes for text of any length. Mixing these up is a very common early mistake.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Why Size Matters</h2>
        <p className="leading-relaxed text-foreground/90">
          Each type reserves a fixed amount of memory. An <code className="px-1 rounded bg-muted font-mono text-xs">int</code> is
          typically 4 bytes, a <code className="px-1 rounded bg-muted font-mono text-xs">char</code> just 1. You can check
          this yourself on any system with the <code className="px-1 rounded bg-muted font-mono text-xs">sizeof</code> operator:
        </p>
        <CodeBlock code={sizeofCode} highlightLines={[4, 5, 6]} />
        <p className="leading-relaxed text-foreground/90">
          This matters because it puts a limit on the values a type can hold. An{' '}
          <code className="px-1 rounded bg-muted font-mono text-xs">int</code> can't store a number as large as a{' '}
          <code className="px-1 rounded bg-muted font-mono text-xs">double</code> can, and it can't store decimals at all.
        </p>
      </section>

      <Callout icon={Lightbulb} title="float vs. double — which one?">
        <p>
          Both store decimal numbers. <code className="px-1 rounded bg-muted/60 font-mono text-xs">double</code> is
          more precise and is the default choice in almost all modern C++ code — reach for{' '}
          <code className="px-1 rounded bg-muted/60 font-mono text-xs">float</code> only when you have a specific
          reason to save memory (e.g. huge arrays of numbers, like in graphics programming).
        </p>
      </Callout>

      <Callout icon={Target} tone="success" title="Try It Yourself">
        <p>
          Declare one variable of each type shown above — int, float, double, char, bool,
          std::string — give each a value that makes sense for its type, then print all six on
          separate lines using std::cout.
        </p>
      </Callout>

      <section className="rounded-xl border border-border bg-muted/30 p-6 sm:p-8 text-center space-y-3">
        <h3 className="text-xl font-bold">Nice, {firstName}.</h3>
        <p className="text-sm text-muted-foreground max-w-prose mx-auto leading-relaxed">
          Next: constants — values that, once set, are never allowed to change.
        </p>
      </section>
    </article>
  );
}
