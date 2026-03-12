# Prompt Engineering Patterns for TaskClaw Skills

## Pattern 1: Persona + Process + Format

Best for: Skills that follow a structured workflow.

```markdown
You are a [specific role] with expertise in [domain].

## Your process:
1. Analyze the [input type] provided
2. [Evaluation step]
3. [Generation step]
4. [Refinement step]

## Output format:
- **[Section 1]**: [description]
- **[Section 2]**: [description]
- **[Section 3]**: [description]

## Guidelines:
- [Positive guidance]
- [Constraint]
```

**Example**: X Post Writer, Blog Editor, Data Analyst

---

## Pattern 2: Evaluator/Reviewer

Best for: Skills that assess quality and suggest improvements.

```markdown
You are a senior [role]. You review [thing] against this checklist:

## Review checklist:
1. **[Criteria 1]** (1-10): [what to evaluate]
2. **[Criteria 2]** (1-10): [what to evaluate]
3. **[Criteria 3]** (1-10): [what to evaluate]

## Output:
- **Score**: X/10 overall
- **Strengths**: What works well
- **Improvements**: Specific suggestions with rewrites
- **Optimized version**: The improved version, ready to use

## Red flags to catch:
- [Common mistake 1]
- [Common mistake 2]
```

**Example**: Code Reviewer, Content Editor, Proposal Reviewer

---

## Pattern 3: Researcher/Analyst

Best for: Skills that gather and synthesize information.

```markdown
You are a [domain] research analyst.

## Your role:
Given a [input type], you:
1. Research [aspect 1]
2. Analyze [aspect 2]
3. Identify [patterns/trends/insights]
4. Provide actionable recommendations

## Output format:
For each finding:
- **Finding**: [what was discovered]
- **Evidence**: [data/source]
- **Impact**: [why it matters]
- **Recommendation**: [what to do]

## Research guidelines:
- Prioritize [criterion] over [criterion]
- Include [type of data] when available
- Flag [risk factors] explicitly
```

**Example**: Trend Research, Competitive Analysis, SEO Audit

---

## Pattern 4: Generator/Creator

Best for: Skills that produce creative content.

```markdown
You are an expert [creative role].

## Rules:
1. **[Format constraint]**: [specifics]
2. **[Structure rule]**: [specifics]
3. **[Style rule]**: [specifics]
4. **[Quality bar]**: [specifics]

## What NOT to do:
- Don't [common bad practice 1]
- Don't [common bad practice 2]
- Don't [common bad practice 3]

## Variations to offer:
When generating, provide [N] variations:
- **[Variation type 1]**: [description]
- **[Variation type 2]**: [description]
```

**Example**: Copywriter, Email Drafter, Headline Generator

---

## Pattern 5: Classifier/Triage

Best for: Skills that categorize, prioritize, or route items.

```markdown
You are a [domain] triage specialist.

## Classification rules:
Given a [input type], classify it as one of:

### [Category A]
- Criteria: [when to classify as A]
- Action: [what should happen]
- Priority: [level]

### [Category B]
- Criteria: [when to classify as B]
- Action: [what should happen]
- Priority: [level]

## Output:
- **Category**: [assigned category]
- **Confidence**: high/medium/low
- **Reasoning**: [brief explanation]
- **Suggested action**: [next step]

## Edge cases:
- If [ambiguous situation], default to [category]
- If [multiple categories apply], choose [priority rule]
```

**Example**: Support Ticket Triage, Bug Priority Classifier, Lead Scorer

---

## Pattern 6: Advisor/Strategist

Best for: Skills that provide recommendations and strategic guidance.

```markdown
You are a [domain] strategist.

## Your role:
Help the user with [goal] by:
1. Understanding their current situation
2. Identifying opportunities and risks
3. Recommending specific actions
4. Providing implementation guidance

## Recommendation format:
- **Current situation**: [assessment]
- **Opportunity**: [what could be improved]
- **Recommendation**: [specific action]
- **Expected outcome**: [what will happen]
- **Implementation**: [how to do it]

## Important:
- Be specific — avoid generic advice
- Include timelines when possible
- Prioritize recommendations by impact
- Consider constraints the user mentioned
```

**Example**: Scheduling Advisor, Marketing Strategist, Architecture Advisor

---

## Anti-Patterns (What NOT to Do)

### Too Vague
```markdown
Help the user with their content.
```
Fix: Specify persona, process, output format, constraints.

### Too Long
50KB of instructions with every edge case. The AI gets confused.
Fix: Focus on the 80% case. Use knowledge docs for detailed reference.

### No Output Format
The AI doesn't know how to structure its response.
Fix: Always specify output format with sections and structure.

### Conflicting Instructions
"Be concise" + "Include detailed examples for every point"
Fix: Prioritize and be consistent.

### No Constraints
The AI rambles, goes off-topic, or produces low-quality output.
Fix: Include "What NOT to do" section and quality guidelines.
