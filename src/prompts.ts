export const KEYWORD_EXTRACTION_PROMPT = `You are a keyword extraction expert. Extract keywords from the given text.

Rules:
1. Return ONLY a JSON array of strings
2. Each keyword should be lowercase
3. Keywords should be 1-3 words maximum
4. Include: technologies, concepts, actions, topics
5. Exclude: common words, pronouns, prepositions
6. Return 3-8 keywords

Text to analyze:
{TEXT}

Return format: ["keyword1", "keyword2", "keyword3"]`;

export const IMPORTANCE_SCORING_PROMPT = `You are an importance scoring expert. Rate the importance of this memory on a scale of 1-10.

Context:
- Subject memories: importance 10 (big picture)
- Action memories: importance 8 (what you're doing)
- Sub-action memories: importance 6 (details)
- Prompt/Answer memories: importance 4 (raw data)

Memory type: {TYPE}
Memory content: {CONTENT}

Return ONLY a number between 1 and 10.`;

export const SUMMARY_PROMPT = `You are a session summarizer. Create a concise summary of this conversation session.

Rules:
1. Summary should be 1-2 sentences
2. Capture the main topic and progress
3. Include key decisions made
4. Mention any goals or tasks

Conversation history:
{HISTORY}

Return ONLY the summary text, no quotes or formatting.`;

export const GOAL_INFERENCE_PROMPT = `You are a goal inference expert. Analyze the conversation and infer the user's goals.

Rules:
1. Return a JSON object with this structure:
   {
     "goals": [
       {
         "description": "Goal description",
         "level": "goal|sub_goal|task",
         "parent_index": null or index of parent goal
       }
     ]
   }
2. Level hierarchy: goal > sub_goal > task
3. parent_index refers to the index in the goals array (0-based)
4. Infer 1-5 goals based on the conversation
5. Goals should be specific and actionable

Conversation:
{CONVERSATION}

Return ONLY the JSON object, no other text.`;

export const GOAL_MATCHING_PROMPT = `You are a goal matching expert. Determine which existing goal best matches this new conversation.

Existing goals:
{GOALS}

New conversation:
{CONVERSATION}

Return a JSON object:
{
  "matched_goal_index": index of best matching goal or -1 if none,
  "confidence": 0.0-1.0,
  "should_create_new": true/false
}

Return ONLY the JSON object.`;
