"use client";

import { useState, useEffect, useRef } from 'react';

const faqs = [
  {
    question: 'Do I need my own OpenClaw instance?',
    answer:
      'Yes. TaskClaw orchestrates the task flow, but the AI execution happens on your OpenClaw — running on your own VPS or machine. This means your data stays private, and you control the compute. We\'ll provide setup guides to make it easy.',
  },
  {
    question: 'Which task management tools are supported?',
    answer:
      'At launch: Notion and ClickUp, with two-way sync. We\'re planning support for Asana, Linear, Todoist, and Trello based on demand. Tasks sync in real-time and status changes flow back to the original tool.',
  },
  {
    question: 'What are "Skills" and "Knowledge Databases"?',
    answer:
      'Skills are pre-configured AI instruction sets — like "blog-writer", "code-reviewer", or "market-researcher". Knowledge Databases are document collections your AI can reference — brand guidelines, SOPs, product docs. You assign them per category or per task, so your AI always has the right context without manual prompting.',
  },
  {
    question: 'Is my data safe?',
    answer:
      'Absolutely. TaskClaw syncs task metadata (titles, status, categories) to display your board. But all AI processing happens on YOUR OpenClaw instance — on your machine, your VPS, your rules. We never see or store the output of your AI work.',
  },
  {
    question: 'How much will it cost?',
    answer:
      'Pricing is being finalized. Waitlist members will get early access at a discounted rate. Your OpenClaw compute costs are separate and depend on your own setup.',
  },
];

const Pricing = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
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

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-20 relative" ref={sectionRef}>
      <div className="section-container">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center mb-3 px-3 py-1 rounded-full bg-foreground/5 border border-foreground/10 text-xs text-foreground/70 reveal">
            <span className="mr-2 size-2 rounded-full bg-claw-red"></span>
            FAQ
          </div>
          <h2 className="section-title reveal" style={{ animationDelay: '0.05s' }}>
            Common Questions
          </h2>
        </div>

        <div className="max-w-2xl mx-auto">
          {faqs.map((faq, index) => (
            <div
              key={index}
              className="border-b border-foreground/10 reveal"
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <button
                onClick={() => toggleFaq(index)}
                className="w-full flex items-center justify-between py-5 text-left group"
              >
                <span className="text-base font-semibold text-foreground group-hover:text-claw-red transition-colors pr-4">
                  {faq.question}
                </span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className={`w-5 h-5 flex-shrink-0 text-foreground/40 transition-transform duration-300 ${
                    openIndex === index ? 'rotate-180' : ''
                  }`}
                >
                  <path
                    fillRule="evenodd"
                    d="M12.53 16.28a.75.75 0 01-1.06 0l-7.5-7.5a.75.75 0 011.06-1.06L12 14.69l6.97-6.97a.75.75 0 111.06 1.06l-7.5 7.5z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ${
                  openIndex === index ? 'max-h-96 pb-5' : 'max-h-0'
                }`}
              >
                <p className="text-foreground/60 text-sm leading-relaxed">
                  {faq.answer}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Pricing;
