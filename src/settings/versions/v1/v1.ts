import {
    MAX_DELAY,
    MAX_MAX_CHAR_LIMIT,
    MIN_DELAY,
    MIN_MAX_CHAR_LIMIT,
} from "../shared";
import {z} from "zod";
import { modelOptionsSchema, AIApiSettingsSchema} from "../shared";
import {isRegexValid, isValidIgnorePattern} from "../../utils";



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
	AIApiSettings: AIApiSettingsSchema,
	webSocketUrl: z.string().url({ message: "Invalid WebSocket URL (e.g., wss://your-host.com/ws)" }),
	triggers: z.array(triggerSchema),
	delay: z.number().int().min(MIN_DELAY, {message: "Delay must be between 0ms and 2000ms"}).max(MAX_DELAY, {message: "Delay must be between 0ms and 2000ms"}),
	modelOptions: modelOptionsSchema,
	// systemMessage: z.string().min(3, {message: "System message must be at least 3 characters long"}), // Removed
	// fewShotExamples: z.array(fewShotExampleSchema), // Removed
	userMessageTemplate: z.string().min(3, {message: "User message template must be at least 3 characters long"}),
	chainOfThoughRemovalRegex: z.string().refine((regex) => isRegexValid(regex), {message: "Invalid regex"}),
	dontIncludeDataviews: z.boolean(),
	maxPrefixCharLimit: z.number().int().min(MIN_MAX_CHAR_LIMIT, {message: `Max prefix char limit must be at least ${MIN_MAX_CHAR_LIMIT}`}).max(MAX_MAX_CHAR_LIMIT, {message: `Max prefix char limit must be at most ${MAX_MAX_CHAR_LIMIT}`}),
	maxSuffixCharLimit: z.number().int().min(MIN_MAX_CHAR_LIMIT, {message: `Max prefix char limit must be at least ${MIN_MAX_CHAR_LIMIT}`}).max(MAX_MAX_CHAR_LIMIT, {message: `Max prefix char limit must be at most ${MAX_MAX_CHAR_LIMIT}`}),
	removeDuplicateMathBlockIndicator: z.boolean(),
	removeDuplicateCodeBlockIndicator: z.boolean(),
	ignoredFilePatterns: z.string().refine((value) => value
			.split("\n")
			.filter(s => s.trim().length > 0)
			.filter(s => !isValidIgnorePattern(s)).length === 0,
			{message: "Invalid ignore pattern"}
	),
	ignoredTags: z.string().refine((value) => value
			.split("\n")
			.filter(s => s.includes(" ")).length === 0, {message: "Tags cannot contain spaces"}
	).refine((value) => value
			.split("\n")
			.filter(s => s.includes("#")).length === 0, {message: "Enter tags without the # symbol"}
	).refine((value) => value
			.split("\n")
			.filter(s => s.includes(",")).length === 0, {message: "Enter each tag on a new line without commas"}
	),
	cacheSuggestions: z.boolean(),
	debugMode: z.boolean(),
	wsDebounceMillis: z.number().int().min(0).optional(), // Add wsDebounceMillis
}).strict();
// ...existing code...


export const DEFAULT_SETTINGS: Settings = {
    version: "1",
    enabled: true,
    advancedMode: false,
		webSocketUrl: "wss://still-weekly-tortoise.ngrok-free.app/ws",
    AIApiSettings: {
        key: "",
        url: process.env.SPECTACULAR_TARGET_PORT as string,
    },
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
    modelOptions: {
        temperature: 1,
        top_p: 0.1,
        frequency_penalty: 0.25,
        presence_penalty: 0,
        max_tokens: 800,
    },
    userMessageTemplate: "{{prefix}}<mask/>{{suffix}}",
    chainOfThoughRemovalRegex: `(.|\\n)*ANSWER:`,
    // Preprocessing settings
    dontIncludeDataviews: true,
    maxPrefixCharLimit: 4000,
    maxSuffixCharLimit: 4000,
    // Postprocessing settings
    removeDuplicateMathBlockIndicator: true,
    removeDuplicateCodeBlockIndicator: true,
    ignoredFilePatterns: "**/secret/**\n",
    ignoredTags: "",
    cacheSuggestions: true,
    debugMode: false,
	wsDebounceMillis: 1000 * 60 * 5, // Add default value (e.g., 5 minutes)
	};

	export const pluginDataSchema = z.object({
		settings: settingsSchema,
}).strict();

export type Settings = z.input<typeof settingsSchema>;
export type Trigger = z.infer<typeof triggerSchema>;
export type PluginData = z.infer<typeof pluginDataSchema>;

