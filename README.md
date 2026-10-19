# MyMeals+

**Meal planning and meal prep with a free AI recipe assistant.**

MyMeals+ is everything [MyMeals](https://github.com/AlbertoPrats/MyMeals) does, plus an assistant. With MyMeals you plan your week, cook in batches, keep track of leftovers and shop with one list. With MyMeals+ you can also:

- **create a recipe** by describing it in your own words;
- **adapt any recipe** ("make it vegetarian", "for 2", "lighter");
- **get suggestions** for what to eat, based on what you like and what your week needs;
- **see your history:** how often you've made each dish.

**Open the app: [albertoprats.github.io/MyMealsPlus](https://albertoprats.github.io/MyMealsPlus/)**

- Free: no account, no ads, no subscriptions. The assistant uses free AI services.
- Your plan and recipes are stored only on your phone, and everything except the assistant works offline.
- The app is in Spanish.

> Prefer the app without the assistant? Use **[MyMeals](https://github.com/AlbertoPrats/MyMeals)**. The two apps are independent and don't share data, so you can use either or both.

---

## Contents

1. [What you can do](#what-you-can-do)
2. [Install it](#install-it)
3. [Set up the assistant](#set-up-the-assistant)
4. [Getting started](#getting-started)
5. [The assistant](#the-assistant)
   - [Create a recipe from a description](#create-a-recipe-from-a-description)
   - [Adapt a recipe](#adapt-a-recipe)
   - [Suggestions: what should I eat?](#suggestions-what-should-i-eat)
   - [Ideas for new recipes](#ideas-for-new-recipes)
   - [What the assistant receives](#what-the-assistant-receives)
6. [History and favourites](#history-and-favourites)
7. [Everything else: planning, leftovers, meal prep](#everything-else-planning-leftovers-meal-prep)
8. [The included recipes](#the-included-recipes)
9. [Your data](#your-data)
10. [Questions and answers](#questions-and-answers)
11. [For developers](#for-developers)

---

## What you can do

- **Plan the week:** a calendar strip at the top, with each day's meals below.
- **Create meals by describing them:** "las lentejas de mi abuela con chorizo, para 4" becomes a full recipe with ingredients, steps, servings, how long it keeps, and nutrition.
- **Adapt recipes in a chat:** ask for changes and review them before applying.
- **Ask what to eat:** the assistant chooses from your recipes and explains why.
- **Discover new recipes:** ideas that match your favourites and fill your week's gaps.
- **Use what you cook:** extra portions are kept as leftovers and offered first, with fridge-life warnings and freezing.
- **Meal-prep a few days at once:** fill the days automatically, see what to cook, and get one combined shopping list.
- **Track what you eat:** see how many times you've made each recipe, and filter your favourites.

## Install it

MyMeals+ is a web app you add to your Home Screen. It then opens full screen like any other app. You don't need the App Store, an account or payment.

### iPhone or iPad

1. Open **[albertoprats.github.io/MyMealsPlus](https://albertoprats.github.io/MyMealsPlus/)** in **Safari**.
2. Wait a few seconds until the week appears.
3. Tap **Share** (the square with an arrow), then **Add to Home Screen**, then **Add**. The icon is purple with a "+".
4. Open MyMeals+ from the new icon.

### Android

1. Open the link in **Chrome**.
2. Tap the **⋮** menu, then **Add to Home screen** or **Install app**.

### Computer

It works in any modern browser (Chrome, Edge, Safari, Firefox). In Chrome or Edge you can install it from the install icon in the address bar.

### Coming from MyMeals?

1. In MyMeals, go to **Ajustes ▸ Guardar copia**.
2. In MyMeals+, go to **Ajustes ▸ Restaurar copia** and choose that file. Your plan, recipes and settings come across.

### Updates

When a new version is available, the app shows **"Nueva versión disponible"**. Tap **Actualizar**; your data is kept.

## Set up the assistant

The assistant needs a free key from one of two AI services. It takes about two minutes. Neither service asks for a card, payment or trial, and the app only ever uses their free models.

| Service | Free limits | Get a key |
|---|---|---|
| **OpenRouter** (free models) | 50 requests a day, 20 a minute | [openrouter.ai](https://openrouter.ai/) |
| **Groq** (free plan) | Daily limits shown in your Groq account | [console.groq.com](https://console.groq.com/) |

One recipe, one chat message or one round of suggestions uses one request (occasionally two, see [below](#what-the-assistant-receives)).

### OpenRouter

1. Sign up at **[openrouter.ai](https://openrouter.ai/)** with your email or GitHub account. Don't add credits or a card.
2. Go to **[openrouter.ai/settings/keys](https://openrouter.ai/settings/keys)**, choose **Create key**, and copy it. It's only shown once.
3. In MyMeals+, go to **Ajustes ▸ Asistente**:
   - select **OpenRouter · solo modelos gratis**;
   - paste the key and tap **Guardar**;
   - leave the model as **`openrouter/free`**, which uses whichever free model is available;
   - tap **Probar**. You should see *"Funciona correctamente"*.
4. If you see a message about a **data policy**, go to **[openrouter.ai/settings/privacy](https://openrouter.ai/settings/privacy)**, allow free models, then tap **Probar** again.

To use one specific free model, tap **Cargar modelos**. Only free ones (ending in `:free`) are listed.

### Groq

1. Sign up at **[console.groq.com](https://console.groq.com/)** and stay on the free plan.
2. In **API Keys**, choose **Create API Key** and copy it. It's only shown once.
3. In MyMeals+, go to **Ajustes ▸ Asistente**:
   - select **Groq · plan gratuito**;
   - paste the key and tap **Guardar**;
   - leave the model as **`openai/gpt-oss-120b`**, or tap **Cargar modelos** to choose another;
   - tap **Probar**.

The key is saved only on your phone, and you can delete it at any time with **Borrar**. If you reach a daily limit, wait until the next day or switch to the other service.

## Getting started

1. **Set up the assistant** (above).
2. **Create a meal:** on **Semana**, tap **+** on *Comida* (lunch), go to **Crear nueva**, describe what you're going to eat, and tap **Crear receta con el asistente**.
3. **Plan the rest:** tap **+** on other meals. Leftovers appear first, and **Sugerir** asks the assistant what to eat.
4. **Adapt a recipe:** open a recipe in **Recetas** and tap **Modificar con el asistente**.
5. **Meal-prep a few days:** go to **Preparación ▸ Nueva**, then **Autocompletar**, then **Compra** for the shopping list.
6. **Back up now and then:** **Ajustes ▸ Guardar copia**.

## The assistant

The assistant never changes anything by itself. You always see the result first, then choose to save it, apply it, or ignore it.

### Create a recipe from a description

Tap **+** on any meal, then **Crear nueva**:

1. **Describe the meal.** Be as brief or as detailed as you like: "algo rápido con pollo y arroz", or a full description with ingredients and quantities.
2. **Pick a group (optional).** Otherwise the assistant chooses it.
3. **Tap Crear receta con el asistente.** The assistant writes the full recipe:
   - name and food group;
   - servings and time;
   - how long it keeps in the fridge and whether it freezes well;
   - ingredients with quantities;
   - steps;
   - nutrition per serving.
4. **Review the preview**, then tap **Guardar y añadir**, **Guardar y editar** (to adjust it yourself first), or **Otra versión**.

If you'd rather not use the assistant for a meal, **Añadir sin receta por ahora** adds it marked *por completar* (to complete). Later you can open it in Recetas and tap **Completar con el asistente**.

### Adapt a recipe

Open a recipe and tap **Modificar con el asistente**, or go to the **Asistente** tab and pick it under *Receta*.

- **Ask for a change.** Use the quick buttons (*Hazla vegetariana*, *Para 2 raciones*, *Menos calorías*, *Más proteína*, *Más rápida*, *Sin gluten*) or write your own ("sin lactosa", "para el horno en vez de la airfryer"…).
- **Review the proposal.** The assistant explains what it did and shows the new recipe, with a summary of what changes (name, servings, ingredients, calories).
- **Choose what to do:** **Aplicar** updates the recipe, and **Guardar como nueva** keeps both.
- **Keep the conversation going.** You can ask follow-up questions; the assistant remembers the last few messages.

With no recipe selected, you can ask general questions or request a completely new recipe.

### Suggestions: what should I eat?

There are two ways to ask:

- **In the + sheet**, under *Sugerencias del asistente*. Optionally type a craving ("algo ligero", "con pescado"), then tap **Sugerir**.
- **In the Asistente tab**, tap **¿Qué como?**. It suggests for the next meal you haven't planned yet.

You get three of your own recipes, each with a short reason, for example *"Es tu favorita y no la has comido esta semana"*. Tap one, or **Añadir**, to plan it.

### Ideas for new recipes

In the **Asistente** tab, tap **Ideas para mí**. The assistant proposes new recipes you don't have yet. They're inspired by your favourites and what you eat most, and favour the food groups your week is short of. Save the ones you like with **Guardar receta**.

### What the assistant receives

The assistant doesn't just receive your words. The app adds the information it needs to give a useful answer:

| You ask for… | The assistant also receives |
|---|---|
| **A new recipe** | The app's food groups, the recipe format and rules (quantities for all servings, realistic fridge life, nutrition per serving), and the default number of servings. |
| **A change to a recipe** | The full current recipe and the last few messages of the conversation. It's told to change only what you ask, rescale quantities if the servings change, and update time, fridge life and nutrition. |
| **Suggestions** | A shortlist of 12 of your recipes: favourites, often eaten, not had in the last few days, from every food group. It also receives each recipe's details, this week's plan, your available leftovers, and how many meals of each food group you've planned. |
| **New ideas** | Your favourites, what you eat most, your week's food-group gaps, and the names of your recipes (so it doesn't repeat them). |

**Checking the replies:**
- **Every answer is checked before you see it.** If an answer is incomplete or badly formatted, the app automatically asks the assistant once to correct it. If that also fails, you see a message and can tap **Reintentar**.
- **Suggestions only come from your recipes.** Anything that isn't one of your recipes is ignored.

## History and favourites

- **History:** a meal counts as eaten when its day has passed, or when you mark it as eaten (**Ya comido** in the meal's details).
  - **Each recipe's page** shows how many times you've made it, how many meals it gave, and when you last had it.
  - **The Recetas list** shows "hecha N×" next to each recipe.
  - **It's kept when you clear old plans.**
- **Favourites:** tap the ★ on a recipe's page.
  - **Filter:** in Recetas, tap **Favoritas**.
  - **Sort:** order the list **A–Z** or by **Más hechas** (most made).
  - **Used everywhere:** the assistant takes your favourites and history into account for suggestions and ideas, and **Autocompletar** chooses favourites more often.

## Everything else: planning, leftovers, meal prep

MyMeals+ includes all of MyMeals. In short:

- **Semana**: the main screen.
  - **The week strip:** tap a day to see its meals; a dot means meals are planned, and the day's calories are shown next to its title.
  - **The + button:** on each slot (*Comida*, *Cena*… add others in Ajustes), it opens the recipe list, with leftovers first. Choose how many people and ×1/×2/×3 quantity.
  - **Tapping a meal:** see its batch and fridge life, then freeze it, mark it as eaten, move it, or remove it.
- **Leftovers and the floating bubble:**
  - **Batches:** cooking a 4-serving recipe uses 1 portion and keeps 3 as leftovers, offered first for later meals.
  - **The bubble** (bottom right) counts them and pulses when something must be eaten soon.
  - **Expiry and freezing:** leftovers expire after the recipe's fridge life; freezing removes the expiry.
- **Preparación**: plan any number of days together, optionally with one cooking day.
  - **Plan:** **Autocompletar** fills the gaps with leftovers and balanced recipes, and **Equilibrio** compares meals per food group with the recommendation.
  - **Cocinar:** what to cook and when.
  - **Compra:** one shopping list with amounts added up. Each dish is counted once, never per leftover. It has tick boxes, Swedish product names, and **Compartir**.
- **Recetas**: search, filter by group, scale any recipe to the servings you need, edit recipes or write your own.
- **Ajustes**: the assistant, meal slots, ingredients you always have at home, backups (**Guardar copia / Restaurar copia**), and reset.

For a detailed description of each screen, see the [MyMeals documentation](https://github.com/AlbertoPrats/MyMeals#how-it-works).

## The included recipes

The app comes with **37 recipes** in five food groups. The recommended number of meals per week for each group is in brackets:

| Group | Per week | Examples |
|---|---|---|
| **Legumbres** (legumes) | 3–4 | Chili con carne, red lentil dal, hummus with pita, black bean burritos |
| **Pescado** (fish) | 2–3, one oily | Air-fryer salmon, poke bowl, fish tacos, prawn fried rice |
| **Pollo** (chicken) | 2–3 | Coconut chicken curry, fajitas, teriyaki chicken, shawarma |
| **Carne roja / cerdo** (red meat / pork) | 1–2 | Lasagne, bolognese with hidden vegetables, meatballs, Korean beef bowl |
| **Huevos** (eggs) | 2–3 | Spanish omelette, shakshuka, carbonara, vegetable frittata |

Every recipe lists servings, time, equipment, how long it keeps, whether it freezes well, ingredients (with Swedish product names), steps, and approximate nutrition per serving. Recipes you create with the assistant follow the same format.

## Your data

- **Stored only on your phone.** There's no account and no server.
- **Your key also stays on your phone.** It's saved separately and isn't included in backups.
- **What goes to the AI service:** only the request you make and the information listed in [What the assistant receives](#what-the-assistant-receives). Free AI services may keep requests, so don't include personal details in them.
- **Works offline:** once installed, everything except the assistant works without internet.
- **Deleting the app's icon also deletes its data**, so save a backup from time to time with **Ajustes ▸ Guardar copia**.

## Questions and answers

**Does it cost anything?**
No. The app is free, and the assistant only uses free AI services and models. Neither service asks for a card. Don't add credits or a payment method to those accounts, and the assistant stays free.

**The assistant says I reached a limit.**
Free services allow a number of requests per day: 50 on OpenRouter, while Groq's are shown in your account. Wait until the next day, or switch to the other service in **Ajustes ▸ Asistente**.

**OpenRouter mentions a "data policy".**
Allow free models in [openrouter.ai/settings/privacy](https://openrouter.ai/settings/privacy), then try again.

**Are the AI recipes always right?**
They're usually good, but always check cooking times and temperatures, especially for chicken, fish and eggs. You can edit any recipe before or after saving it.

**Can I use the app without the assistant?**
Yes. Planning, leftovers, meal prep and shopping lists work without a key. You can also add meals without a recipe and complete them later. Or use [MyMeals](https://github.com/AlbertoPrats/MyMeals), the version without an assistant.

**Can I use my ChatGPT, Claude or Gemini account?**
No. Those services don't let other apps sign in with your account. The assistant works with free OpenRouter or Groq keys instead.

**Can I use it on two phones?**
Each phone has its own data. Move it with **Guardar copia** and **Restaurar copia**. The key isn't included, so paste it again on the new phone.

**Is there an English version?**
For now the app is in Spanish.

## For developers

The app is plain JavaScript with [Preact](https://preactjs.com/) and [htm](https://github.com/developit/htm), vendored in `app/vendor/`, with no build step. It's a Progressive Web App (PWA): a service worker caches it for offline use, and data is stored in the browser's IndexedDB. The assistant calls OpenRouter's or Groq's chat-completions API directly from the browser with the user's own key.

```
recetas.md            the recipe collection (source)
app/                  the app, served as-is
  data/recipes.json   generated from recetas.md
  js/ai/              AI services, request + correction turn, key storage
  js/core/            logic: planner, shopping list, autofill, history, suggestions, AI prompts and reply checks
  js/ui/              screens, incl. the assistant
tests/                logic tests (node --test) and browser tests (Playwright, with a fake AI service)
tools/                recipe builder, icons, local server
```

You need Node 22:

```bash
npm install
npm run serve            # http://localhost:8080
npm test                 # logic tests
npm run test:e2e         # browser tests at iPhone size (needs: npx playwright install chromium webkit)
npm run build:recipes    # rebuild app/data/recipes.json after editing recetas.md
```
