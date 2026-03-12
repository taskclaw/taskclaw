"use client";

import { useEffect, useRef } from 'react';
import GlassCard from './GlassCard';

const problems = [
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path fillRule="evenodd" d="M15.97 2.47a.75.75 0 011.06 0l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 11-1.06-1.06l3.22-3.22H7.5a.75.75 0 010-1.5h11.69l-3.22-3.22a.75.75 0 010-1.06zm-7.94 9a.75.75 0 010 1.06l-3.22 3.22H16.5a.75.75 0 010 1.5H4.81l3.22 3.22a.75.75 0 11-1.06 1.06l-4.5-4.5a.75.75 0 010-1.06l4.5-4.5a.75.75 0 011.06 0z" clipRule="evenodd" />
      </svg>
    ),
    title: 'Tool Fragmentation',
    description: 'Personal tasks in Notion. Work in ClickUp. Side projects in Trello. Your brain is the only "integration" between them.',
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 6a.75.75 0 00-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 000-1.5h-3.75V6z" clipRule="evenodd" />
      </svg>
    ),
    title: 'Starting is the Hardest Part',
    description: "You know what to do. You have the list. But opening the doc, writing the first draft, researching the topic — that's where momentum dies.",
  },
  {
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
        <path d="M16.5 7.5h-9v9h9v-9z" />
        <path fillRule="evenodd" d="M8.25 2.25A.75.75 0 019 3v.75h2.25V3a.75.75 0 011.5 0v.75H15V3a.75.75 0 011.5 0v.75h.75a3 3 0 013 3v.75H21A.75.75 0 0121 9h-.75v2.25H21a.75.75 0 010 1.5h-.75V15H21a.75.75 0 010 1.5h-.75v.75a3 3 0 01-3 3h-.75V21a.75.75 0 01-1.5 0v-.75h-2.25V21a.75.75 0 01-1.5 0v-.75H9V21a.75.75 0 01-1.5 0v-.75h-.75a3 3 0 01-3-3v-.75H3A.75.75 0 013 15h.75v-2.25H3a.75.75 0 010-1.5h.75V9H3a.75.75 0 010-1.5h.75v-.75a3 3 0 013-3h.75V3a.75.75 0 01.75-.75zM6 6.75A.75.75 0 016.75 6h10.5a.75.75 0 01.75.75v10.5a.75.75 0 01-.75.75H6.75a.75.75 0 01-.75-.75V6.75z" clipRule="evenodd" />
      </svg>
    ),
    title: 'AI Without Direction',
    description: 'You have powerful AI assistants. But every time you use them, you write the prompt from scratch, set context, explain the task. Every. Single. Time.',
  },
];

const Stats = () => {
  const sectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const elements = entry.target.querySelectorAll('.reveal');
            elements.forEach((el, i) => {
              setTimeout(() => {
                el.classList.add('active');
              }, i * 100);
            });
          }
        });
      },
      { threshold: 0.1 }
    );

    if (sectionRef.current) {
      observer.observe(sectionRef.current);
    }

    return () => {
      if (sectionRef.current) {
        observer.unobserve(sectionRef.current);
      }
    };
  }, []);

  return (
    <section id="problem" className="relative py-20" ref={sectionRef}>
      <div className="section-container">
        <div className="mb-12">
          <div className="inline-flex items-center justify-center mb-3 px-3 py-1 rounded-full bg-foreground/5 border border-foreground/10 text-xs text-foreground/70">
            <span className="mr-2 size-2 rounded-full bg-claw-red"></span>
            The Problem
          </div>
          <h2 className="section-title reveal">
            Your task manager is a glorified to-do list.
          </h2>
          <p className="section-subtitle reveal" style={{ animationDelay: '0.1s' }}>
            You spend more time managing tasks than doing them. Context-switching between apps. Copying info. Staring at a backlog that never shrinks. Sound familiar?
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {problems.map((problem, index) => (
            <GlassCard
              key={index}
              className="h-full reveal"
              hoverEffect
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="flex flex-col h-full">
                <div className="mb-4 w-12 h-12 rounded-full flex items-center justify-center bg-claw-red/10 text-claw-red">
                  {problem.icon}
                </div>
                <h3 className="text-xl font-bold mb-3 text-foreground">{problem.title}</h3>
                <p className="text-foreground/70 text-sm flex-grow">{problem.description}</p>
              </div>
            </GlassCard>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Stats;
