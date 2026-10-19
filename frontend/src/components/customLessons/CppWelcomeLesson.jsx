/**
 * CppProgramOverviewLesson: one custom lesson, two internal views.
 * Overview screen is a full-bleed hero banner (edge to edge of the
 * viewport, breaking out of the lesson page's centered container) using
 * the platform's own primary green token. Clicking a topic card switches
 * the same component into a sidebar detail view.
 *
 * component_key suggestion: cpp-program-overview
 */
import { useState } from 'react';
import { Code2, ArrowLeft, Terminal, GitBranch } from 'lucide-react';

const TOPICS = [
  {
    id: 'how-it-runs',
    icon: Terminal,
    letter: 'a',
    title: 'How a program runs',
    sidebarLabel: 'How it runs',
    body: (
      <>
        <p className="leading-relaxed text-foreground/90">
          C++ is a compiled language. Before your program can run, a separate program called a
          compiler translates your source code into machine instructions the processor can
          execute directly.
        </p>
        <p className="leading-relaxed text-foreground/90">
          This is different from an interpreted language like Python, which is read and run line
          by line. In C++, there are two clear steps: compiling (translating) and executing
          (running the translated result). The compiler stops you with an error before your
          program ever runs if something breaks a rule of the language.
        </p>
      </>
    ),
  },
  {
    id: 'anatomy',
    icon: GitBranch,
    letter: 'b',
    title: 'Anatomy of main()',
    sidebarLabel: 'Anatomy of main()',
    body: (
      <>
        <div className="rounded-lg overflow-hidden border border-border bg-slate-950 my-3">
          <pre className="p-3 text-[12px] leading-relaxed text-slate-300 font-mono overflow-x-auto">
{`#include <iostream>

int main() {
    std::cout << "Hello, world!";
    return 0;
}`}
          </pre>
        </div>
        <p className="leading-relaxed text-foreground/90">
          <code className="px-1 rounded bg-muted font-mono text-xs">#include</code> pulls in
          tools before compiling even starts. <code className="px-1 rounded bg-muted font-mono text-xs">main()</code> is
          the entry point every program needs exactly one of. Each line inside ending in a
          semicolon is a statement, a single complete instruction.
        </p>
      </>
    ),
  },
];

// Sharp chevron/arrow tab shape, used for the breadcrumb and the topic cards.
// No overlap logic anywhere: every gap below is a real gap, not a negative margin.
const chevronClip = { clipPath: 'polygon(0 0, calc(100% - 22px) 0, 100% 50%, calc(100% - 22px) 100%, 0 100%)' };

function Breadcrumb({ activeLabel }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      <div className="h-10 w-10 shrink-0 rounded-lg border-2 border-primary-foreground/80 flex items-center justify-center font-mono font-bold text-[10px]">
        C++
      </div>
      <div style={chevronClip} className="bg-primary-foreground/15 pl-4 pr-7 py-2 text-sm font-mono">
        C++ programming
      </div>
      <div style={chevronClip} className="bg-foreground text-background pl-4 pr-7 py-2 text-sm font-mono font-bold">
        {activeLabel}
      </div>
    </div>
  );
}

export default function CppProgramOverviewLesson({ student, lesson }) {
  const firstName = (student?.name || 'there').split(' ')[0];
  const [activeId, setActiveId] = useState(null);
  const active = TOPICS.find(t => t.id === activeId);

  // Detail view, opened after clicking a topic card
  if (active) {
    return (
      <article className="max-w-4xl mx-auto py-6 px-4 sm:px-6">
        <div className="rounded-2xl bg-primary text-primary-foreground p-6 sm:p-8 mb-6">
          <Breadcrumb activeLabel={active.title} />
          <button
            onClick={() => setActiveId(null)}
            className="inline-flex items-center gap-1.5 text-sm text-primary-foreground/80 hover:text-primary-foreground transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to overview
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-0 rounded-xl border border-border overflow-hidden">
          <div className="sm:w-44 shrink-0 border-b sm:border-b-0 sm:border-r border-border bg-muted/20 p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold mb-2">On this page</p>
            <div className="flex flex-row sm:flex-col gap-1">
              {TOPICS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveId(t.id)}
                  className={`text-left text-sm px-2.5 py-1.5 rounded-lg transition-colors ${
                    t.id === active.id
                      ? 'bg-primary/10 text-primary font-semibold border-l-2 border-primary'
                      : 'text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {t.sidebarLabel}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 min-w-0 p-5 sm:p-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary mb-3">
              <active.icon className="h-3.5 w-3.5" /> C++ Programming
            </div>
            <h2 className="text-2xl font-bold mb-3">{active.title}</h2>
            <div className="space-y-3">{active.body}</div>
          </div>
        </div>
      </article>
    );
  }

  // Overview / hero screen: full-bleed, edge to edge of the viewport,
  // breaking out of the lesson page's max-w-4xl centered container.
  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] w-screen bg-primary text-primary-foreground">
      <div className="max-w-5xl mx-auto px-6 sm:px-10 lg:px-16 py-10 sm:py-14">
        <Breadcrumb activeLabel="Getting started" />

        <p className="max-w-xl leading-relaxed text-primary-foreground/90 mb-2">
          Hi {firstName}, in this lesson we get comfortable with the practicalities of a C++
          program: what happens when it runs, and what every single program has in common.
        </p>
        <p className="text-sm italic text-primary-foreground/70 mb-8">
          Lesson updated for the Beginner track
        </p>

        <div className="flex flex-col gap-3 max-w-md">
          {TOPICS.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveId(t.id)}
              style={chevronClip}
              className="bg-background text-foreground text-left pl-5 pr-9 py-3 font-mono text-sm hover:bg-muted transition-colors"
            >
              <span className="text-muted-foreground mr-3">{t.letter}</span>
              {t.title}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
