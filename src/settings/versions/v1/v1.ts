import {z} from "zod";
import {isRegexValid} from "../../utils";

export const MIN_DELAY = 0;
export const MAX_DELAY = 2000;
export const MIN_MAX_CHAR_LIMIT = 100;
export const MAX_MAX_CHAR_LIMIT = 10000;

export const triggerSchema = z.object({
    type: z.enum(['string', 'regex']),
    value: z.string().min(1, {message: "Trigger value must be at least 1 character long"})
}).strict().superRefine((trigger, ctx) => {
    if (trigger.type === "regex") {
        if (!trigger.value.endsWith("$")) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Regex triggers must end with a $.",
                path: ["value"],
            });
        }
        if (!isRegexValid(trigger.value)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Invalid regex: "${trigger.value}"`,
                path: ["value"],
            });
        }
    }
});


// ...existing code...
export const settingsSchema = z.object({
	version: z.literal("1"),
	enabled: z.boolean(),
	advancedMode: z.boolean(),
	webSocketUrl: z.string().url({ message: "Invalid WebSocket URL" }),
	triggers: z.array(triggerSchema),
	delay: z.number().int().min(MIN_DELAY, {message: "Delay must be between 0ms and 2000ms"}).max(MAX_DELAY, {message: "Delay must be between 0ms and 2000ms"}),
	userMessageTemplate: z.string().min(3, {message: "User message template must be at least 3 characters long"}),
	chainOfThoughRemovalRegex: z.string().refine((regex) => isRegexValid(regex), {message: "Invalid regex"}),
	dontIncludeDataviews: z.boolean(),
	maxPrefixCharLimit: z.number().int().min(MIN_MAX_CHAR_LIMIT, {message: `Max prefix char limit must be at least ${MIN_MAX_CHAR_LIMIT}`}).max(MAX_MAX_CHAR_LIMIT, {message: `Max prefix char limit must be at most ${MAX_MAX_CHAR_LIMIT}`}),
	maxSuffixCharLimit: z.number().int().min(MIN_MAX_CHAR_LIMIT, {message: `Max prefix char limit must be at least ${MIN_MAX_CHAR_LIMIT}`}).max(MAX_MAX_CHAR_LIMIT, {message: `Max prefix char limit must be at most ${MAX_MAX_CHAR_LIMIT}`}),
	cacheSuggestions: z.boolean(),
	debugMode: z.boolean(),
	wsDebounceMillis: z.number().int().min(0).optional(),
	allowedFolder: z.string().optional()
}).strict();
// ...existing code...


export const DEFAULT_SETTINGS: Settings = {
    version: "1",
    enabled: true,
    advancedMode: false,
		// webSocketUrl: "wss://pobeda.loca.lt/ws",
		webSocketUrl: "ws://it_one_completer:8765/ws",
    triggers: [
        {type: "string", value: "# "},
        {type: "string", value: ". "},
        {type: "string", value: ": "},
        {type: "string", value: ", "},
        {type: "string", value: "! "},
        {type: "string", value: "? "},
        {type: "string", value: "`"},
        {type: "string", value: "' "},
        {type: "string", value: "= "},
        {type: "string", value: "$ "},
        {type: "string", value: "> "},
        {type: "string", value: "\n"},

        // bullet list
        {type: "regex", value: "[\\t ]*(\\-|\\*)[\\t ]+$"},
        // numbered list
        {type: "regex", value: "[\\t ]*[0-9A-Za-z]+\\.[\\t ]+$"},
        // new line with spaces
        {type: "regex", value: "\\$\\$\\n[\\t ]*$"},
        // markdown multiline code block
        {type: "regex", value: "```[a-zA-Z0-9]*(\\n\\s*)?$"},
        // task list normal, sub or numbered.
        {type: "regex", value: "\\s*(-|[0-9]+\\.) \\[.\\]\\s+$"},
    ],

    delay: 500,
    // Request settings
    userMessageTemplate: "{{prefix}}<mask/>{{suffix}}",
    chainOfThoughRemovalRegex: `(.|\\n)*ANSWER:`,
    // Preprocessing settings
    dontIncludeDataviews: true,
    maxPrefixCharLimit: 4000,
    maxSuffixCharLimit: 4000,
    // Postprocessing settings
    cacheSuggestions: true,
    debugMode: false,
		wsDebounceMillis: 1000 * 60 * 5,
		allowedFolder: undefined
	};

	export const pluginDataSchema = z.object({
		settings: settingsSchema,
}).strict();

export type Settings = z.input<typeof settingsSchema>;
export type Trigger = z.infer<typeof triggerSchema>;
export type PluginData = z.infer<typeof pluginDataSchema>;

