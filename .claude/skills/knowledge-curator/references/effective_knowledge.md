# Writing Effective Knowledge Documents

## Principles

### 1. Specificity Over Generality
Bad: "Be professional in all communications"
Good: "Use formal salutations (Dear Mr./Ms.). Close with 'Best regards'. Avoid contractions in emails to external clients."

### 2. Structure for Scanning
The AI needs to quickly find relevant information. Use:
- Clear headings (H2 for sections, H3 for subsections)
- Bullet points for lists
- Tables for structured data
- Bold for key terms

### 3. Actionable Content
Every piece of knowledge should answer: "What should the AI do with this?"

Bad: "Customer satisfaction is important to us."
Good: "If customer satisfaction score < 7/10, escalate to senior support. If >= 7, proceed with standard resolution."

### 4. Examples Are Essential
Show the AI what "good" looks like:

```markdown
### Example: Good response
"Thank you for reaching out, [Name]. I've looked into your account and can see the issue. Here's what I'll do to resolve this: [specific steps]."

### Example: Bad response
"Thanks for contacting us. We'll look into it."
```

## Content Patterns

### Guidelines Doc
```markdown
# [Domain] Guidelines

## Core Rules
- Rule 1: [specific, actionable]
- Rule 2: [specific, actionable]

## Tone & Voice
- [Attribute]: [example]
- [Attribute]: [example]

## Do / Don't
| Do | Don't |
|----|-------|
| [Good practice] | [Bad practice] |

## Edge Cases
- If [situation], then [action]
- If [situation], then [action]
```

### FAQ Doc
```markdown
# Frequently Asked Questions

### Q: [Question]?
**A:** [Complete, approved answer]
**Source:** [Where this answer comes from]

### Q: [Question]?
**A:** [Complete, approved answer]
**When to escalate:** [Trigger condition]
```

### Process Doc
```markdown
# [Process Name]

## Prerequisites
- [Requirement 1]
- [Requirement 2]

## Steps
1. **[Step name]**: [What to do + expected result]
2. **[Step name]**: [What to do + expected result]
3. **[Step name]**: [What to do + expected result]

## Decision Points
- At step 2, if [condition]: go to step 4
- At step 3, if [error]: restart from step 1

## Success Criteria
- [What "done" looks like]
```

### Reference Data Doc
```markdown
# [Domain] Reference Data

## Pricing Table
| Plan | Price | Features |
|------|-------|----------|
| Free | $0 | [features] |
| Pro | $29/mo | [features] |

## Feature Comparison
| Feature | Free | Pro | Enterprise |
|---------|------|-----|-----------|
| [Feature] | Yes | Yes | Yes |

## Definitions
- **[Term]**: [Definition]
- **[Term]**: [Definition]
```

## Size Guidelines

| Doc Type | Recommended Size | Master? |
|----------|-----------------|---------|
| Core guidelines | 2-5 KB | Yes |
| FAQ (top 20) | 3-8 KB | Yes |
| Process guide | 2-5 KB | Yes or No |
| Full reference | 10-50 KB | No |
| Data tables | 5-20 KB | No |

## Testing Your Knowledge Doc

After creating, test by asking the agent questions:
1. "What are the rules for [topic]?" — Should find and cite guidelines
2. "How do I handle [edge case]?" — Should find decision logic
3. "What's the pricing for [plan]?" — Should find reference data
4. "[Ambiguous question]" — Should handle gracefully
