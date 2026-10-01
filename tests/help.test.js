'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../config/config');
const { openDatabase } = require('../src/database/database');
const { createServices } = require('../src/services');
const { createEmbeds } = require('../src/utils/embeds');
const { seedDatabase } = require('../src/database/seed');
const { env, admin, referee, nobody } = require('./helpers');
const help = require('../src/ui/help');
const { loadCommands } = require('../src/commands');

function ctxFor() {
  const config = loadConfig(env());
  const services = createServices(config, { db: openDatabase(':memory:') });
  seedDatabase(services);
  return { config, services, embeds: createEmbeds(config), client: null, commands: loadCommands() };
}

const size = (e) => {
  const d = e.toJSON();
  return (d.title?.length ?? 0) + (d.description?.length ?? 0) + (d.footer?.text.length ?? 0) + (d.fields ?? []).reduce((a, f) => a + f.name.length + f.value.length, 0);
};

test('every help page fits Discord limits for every role', () => {
  const ctx = ctxFor();
  for (const [who, member] of [['member', nobody], ['referee', referee], ['admin', admin]]) {
    for (const p of help.pagesFor(ctx.services.permissions.levelOf(member))) {
      const out = help.render(ctx, member, p.id);
      const d = out.embeds[0].toJSON();
      assert.ok(d.title.length <= 256, `${who}/${p.id} title`);
      assert.ok(d.description.length <= 4096, `${who}/${p.id} description`);
      assert.ok((d.fields ?? []).length <= 25, `${who}/${p.id} field count`);
      for (const f of d.fields ?? []) {
        assert.ok(f.name.length > 0 && f.name.length <= 256, `${who}/${p.id} field name "${f.name}"`);
        assert.ok(f.value.length > 0 && f.value.length <= 1024, `${who}/${p.id} field "${f.name}" is ${f.value.length}`);
      }
      assert.ok(size(out.embeds[0]) <= 6000, `${who}/${p.id} total ${size(out.embeds[0])}`);
      assert.equal(out.components.length, 2);
      assert.ok(out.components[0].components[0].options.length <= 25);
    }
  }
});

test('pages are gated by role, and the menu only lists pages the user may open', () => {
  const ctx = ctxFor();
  const ids = (m) => help.render(ctx, m, 'home').components[0].components[0].options.map((o) => o.data.value);
  assert.ok(!ids(nobody).includes('create') && !ids(nobody).includes('admin'));
  assert.ok(ids(referee).includes('create') && !ids(referee).includes('admin'));
  assert.ok(ids(admin).includes('admin') && ids(admin).length === help.PAGES.length);
  assert.throws(() => help.render(ctx, nobody, 'admin'), /TI Admin/);
  assert.throws(() => help.render(ctx, referee, 'admin'), /TI Admin/);
  assert.doesNotThrow(() => help.render(ctx, referee, 'create'));
});

test('unknown page falls back to home; first/last buttons are disabled', () => {
  const ctx = ctxFor();
  const home = help.render(ctx, nobody, 'nope');
  assert.match(home.embeds[0].toJSON().title, /Help Center/);
  const btns = home.components[1].components.map((b) => b.toJSON());
  assert.equal(btns[0].disabled, true); // Previous
  assert.equal(btns[1].disabled, true); // Home (already home)
  const last = help.pagesFor(0).at(-1).id;
  assert.equal(help.render(ctx, nobody, last).components[1].components[2].toJSON().disabled, true); // Next
});

test('/help is registered, public, and every custom id has the hp: prefix', () => {
  const ctx = ctxFor();
  assert.ok(ctx.commands.get('help'));
  assert.equal(ctx.services.permissions.can(nobody, 'help'), true);
  const json = ctx.commands.get('help').data.toJSON();
  assert.equal(json.options[0].choices.length, help.PAGES.length);
  const out = help.render(ctx, admin, 'faq');
  const cids = [out.components[0].components[0], ...out.components[1].components].map((c) => c.toJSON().custom_id);
  assert.ok(cids.every((c) => c.startsWith('hp:')), cids.join());
});

test('home shows school and vehicle counts, and the directory lists every school with its emoji', () => {
  const ctx = ctxFor();
  const home = help.render(ctx, nobody, 'home').embeds[0].toJSON();
  assert.ok(home.fields.some((f) => f.value.includes('**19** schools')));
  const dir = help.render(ctx, nobody, 'schools').embeds[0].toJSON();
  const text = dir.fields.map((f) => f.value).join('\n');
  assert.ok(text.includes('<:Koala:1555319912879226900> Koala Forest Academy'));
  assert.ok(text.includes('<:All_Stars:1555325242388512818>'));
  assert.equal(text.split('\n').length, 19);
});
