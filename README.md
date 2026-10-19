# MyMeals+

**MyMeals with a free recipe assistant.** It's the same offline meal-prep app as [MyMeals](https://albertoprats.github.io/MyMeals/), plus an AI chatbot that writes and adapts recipes, a history of what you've eaten, and suggestions based on what you like.

The two apps are separate. Use whichever you prefer, or both: they don't share or overwrite each other's data.

Like MyMeals, it's a web app you install to the Home Screen. It works without a Mac or the App Store, costs nothing, and keeps your data on your phone.

## Installing it on the iPhone

1. Open `https://albertoprats.github.io/MyMealsPlus/` in **Safari**.
2. Tap **Share** ▸ **Add to Home Screen**. Its icon is purple with a "+".
3. Open it from the icon.

To bring over your data from MyMeals: in MyMeals go to **Ajustes ▸ Guardar copia**, then in MyMeals+ go to **Ajustes ▸ Restaurar copia**.

## The assistant: free options only

The assistant uses a free AI model through one of two services. Neither needs a card, a payment method, a free trial or periodic reactivation. Choose one and paste your key in **Ajustes ▸ Asistente**:

| Service | Limits | Notes |
|---|---|---|
| **OpenRouter · free models** | 20 requests a minute, 50 a day | The app only allows free models (`openrouter/free` or names ending in `:free`) and refuses any other before sending anything. If OpenRouter mentions its "data policy", allow free models in openrouter.ai/settings/privacy. |
| **Groq · free plan** | Daily limits shown in your Groq account | Default model `openai/gpt-oss-120b`. |

Paid services (the Claude, OpenAI, Gemini and Mistral APIs) are not offered and aren't in the code.

## What the assistant does, and what the model receives

The model never receives just your words. For each feature the app adds the context and rules the model needs, then checks the reply field by field. If a reply can't be used (for example, it isn't valid JSON), the app sends the model one follow-up explaining the problem and asking for a corrected reply. If that also fails, you see an error with a Reintentar button. Nothing is saved until you press a button.

- **Create a recipe:** "+" ▸ **Crear nueva**, then write something like "las lentejas de mi abuela con chorizo, para 4". The model receives:
  - your description, with the instruction to respect everything you said and fill in the rest;
  - the app's food groups;
  - the exact recipe format (same style as `recetas.md`), with rules for quantities, realistic fridge life and nutrition per serving;
  - default servings when you don't give any (2, or 4 for stews).
  
  You see a preview, then **Guardar y añadir** or **Guardar y editar**.
- **Modify a recipe:** on a recipe, tap **Modificar con el asistente**, or pick it in the **Asistente** tab. Then ask ("hazla vegetariana", "para 2", "menos calorías"). The model receives:
  - the full current recipe;
  - the last 6 messages of the conversation;
  - your message;
  - rules: change only what you ask, rescale every quantity if the servings change, update time, fridge life and nutrition when affected, and rename or regroup if the dish changes nature.
  
  You see what would change before you **Aplicar** it, or you can save it as a new recipe.
- **Suggest what to eat:** "+" ▸ **Sugerencias del asistente** (with an optional craving, e.g. "algo ligero"), or **¿Qué como?** in the Asistente tab for the next empty meal. The app first shortlists 12 of your own recipes: favourites, often eaten, not had in the last few days, and at least two per food group. The model receives:
  - that shortlist, with group, time, calories, fridge life, favourite flag, times eaten and days since you last had each;
  - which meal is being planned;
  - this week's plan;
  - meals per food group against the weekly targets;
  - available leftovers;
  - your favourites and most-eaten recipes.
  
  It picks 3 and says why. Anything that isn't in your shortlist is discarded. Tap a suggestion to add it.
- **New recipe ideas:** **Ideas para mí** in the Asistente tab. The model receives your favourites, what you eat most, this week's food-group gaps, and the names of all your recipes (so it doesn't repeat them). You save the ideas you like.
- **Complete a recipe marked "por completar":** from its page. It works like "Create a recipe", using its name as the description.

## History and favourites

- **History:** a meal counts as eaten once its day has passed, or when you mark it as eaten. Each recipe shows how many times you've made it, how many meals it gave, and when you last had it. Clearing old plans doesn't erase the history. The history feeds the suggestions and ideas.
- **Favourites:** the star on a recipe. Favourites can be filtered in Recetas (sort by A–Z or "Más hechas"), are given to the model as your tastes, and are chosen more often by **Autocompletar**.

## Privacy and security

- **API keys stay on the phone.** They're stored separately from your data, never included in backups, never in the repository, and only sent to the service they belong to. **Ajustes ▸ Asistente ▸ Borrar** removes a key.
- **It can't charge you.** Without a card on your OpenRouter or Groq account there is nothing to bill, and the app never uses OpenRouter's paid models. Don't add a card or credits to those accounts, and don't upgrade Groq to its paid plan.
- **Only what's needed is sent to the AI service:** what's listed in the section above for each feature, and nothing else from your data. Free services may store requests, so don't write personal information in them.
- **Connections are locked down:** a Content-Security-Policy only lets the app connect to `openrouter.ai` and `api.groq.com`. It loads no code from other sites; Preact is bundled in `app/vendor/`.
- **AI replies are treated as untrusted data:** each one is checked field by field, limited in size and only ever shown as text. AI recipes can still contain cooking mistakes, so check cooking times and temperatures, especially for chicken, fish and eggs.
- MyMeals+ and MyMeals live on the same website (`albertoprats.github.io`). They use separate storage and caches, so they can't interfere with each other.

## Publishing

This is the same process as MyMeals, in its own repository `MyMealsPlus`:
1. Push this folder to the new repository.
2. Go to **Settings ▸ Pages ▸ Source ▸ GitHub Actions**.
3. Run **Actions ▸ Test and publish**.

Each push runs the tests and publishes.

### Security checklist (public repository)

- Keep **two-factor authentication** on. Whoever controls the account can push code that reaches every installed phone.
- Don't give anyone else write access, and only merge pull requests whose code you've read. Pull requests can't publish.
- Never commit backups (`mymeals-*.json` and `mymealsplus-*.json` are ignored by git) or keys.
- The workflow gives publishing rights only to the publish job, pins every action to an exact commit, and doesn't keep the GitHub token after checkout. When updating an action, replace both the commit hash and the version comment.

## Development

You need Node 22.

```bash
npm install
npm run serve            # http://localhost:8080
npm test                 # logic tests (incl. AI reply checks, and provider requests against a fake network)
npx playwright install chromium webkit
npm run test:e2e         # drives the real app at iPhone size, with a fake AI service
npm run build:recipes    # recetas.md -> app/data/recipes.json
node tools/make-icons.mjs
```

### Layout

```
app/js/ai/          providers (OpenRouter free models, Groq free plan), request + one correction turn, key storage
app/js/core/        logic: planner, shopping, autofill, history, suggestions, AI prompts and reply validation
app/js/ui/          screens, incl. the assistant, AI settings and recipe previews
app/vendor/         Preact + htm
```
