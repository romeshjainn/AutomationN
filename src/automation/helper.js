'use strict';

const db = require('../db/database');

const SEL = {
  questionnaireForm: '[class*="ssQuestions"], [class*="apply-questions"], form[class*="apply"]',
  formField: '[class*="form-group"], [class*="field-wrap"], .ssQuestion',
  submitQuestionnaire: 'button[type="submit"], button[class*="submit"], button[class*="apply"]',
};

const MY_ANSWERS = {
  // Availability
  noticePeriod: '15',
  immediateJoiner: 'yes',
  willingToRelocate: 'yes',
  workMode: 'hybrid', // 'wfh', 'hybrid', 'office'
  shiftPreference: 'day', // 'day', 'night', 'rotational'

  // Location
  currentLocation: 'Noida',
  preferredLocation: 'Noida',

  // Compensation
  currentCTC: '400000',
  expectedCTC: '700000',

  // Experience
  experience: '2', // total years
  relevantExperience: '2',

  // Skills (years in each)
  reactExp: '2',
  nextExp: '2',
  nodeExp: '2',
  javascriptExp: '2',
  typescriptExp: '2',
  pythonExp: '1',
  sqlExp: '2',
  mongoExp: '1',
  awsExp: '1',
  dockerExp: '1',
  gitExp: '2',

  // Current job info
  currentCompany: 'Digimonk Technologies',
  currentDesignation: 'Software Engineer',
  employed: 'yes',
  companyType: 'service', // 'product', 'service', 'startup'

  // Team / Role
  managedTeam: 'yes',
  teamSize: '6',

  // Education
  qualification: 'Bachelor of computer applications',
  passingYear: '2023',
  percentage: '7.67 CGPA',

  // Misc
  hasPassport: 'yes',
  gender: 'male',
  differentlyAbled: 'no',
};

async function handleRadio(field, radios, label) {
  let targetValue = null;

  if (label.includes('notice')) targetValue = MY_ANSWERS.noticePeriod;
  else if (label.includes('relocat')) targetValue = MY_ANSWERS.willingToRelocate;
  else if (
    label.includes('work from home') ||
    label.includes('wfh') ||
    label.includes('work mode') ||
    label.includes('remote')
  )
    targetValue = MY_ANSWERS.workMode;
  else if (label.includes('immediate') || label.includes('immediate joiner'))
    targetValue = MY_ANSWERS.immediateJoiner;
  else if (label.includes('shift') || label.includes('night shift') || label.includes('rotational'))
    targetValue = MY_ANSWERS.shiftPreference;
  else if (
    label.includes('currently employed') ||
    label.includes('are you employed') ||
    label.includes('working')
  )
    targetValue = MY_ANSWERS.employed;
  else if (label.includes('team') || label.includes('manage') || label.includes('lead'))
    targetValue = MY_ANSWERS.managedTeam;
  else if (label.includes('passport')) targetValue = MY_ANSWERS.hasPassport;
  else if (
    label.includes('differently abled') ||
    label.includes('disability') ||
    label.includes('handicap')
  )
    targetValue = MY_ANSWERS.differentlyAbled;
  else if (label.includes('gender')) targetValue = MY_ANSWERS.gender;
  else if (label.includes('company type') || label.includes('product') || label.includes('service'))
    targetValue = MY_ANSWERS.companyType;

  for (const radio of radios) {
    const radioLabel = await radio.evaluate((el) => {
      const parent = el.closest('label') || el.parentElement;
      return parent?.textContent?.toLowerCase().trim() || el.value?.toLowerCase() || '';
    });

    const val = ((await radio.getAttribute('value')) || '').toLowerCase();

    if (targetValue && (radioLabel.includes(targetValue) || val.includes(targetValue))) {
      await radio.click();
      return;
    }
  }

  await radios[0].click();
  db.addLog({ level: 'warn', event: 'questionnaire', message: `  Radio fallback (first option) for: "${label}"` });
}

async function handleSelect(select, label) {
  let value = null;

  if (label.includes('notice')) value = MY_ANSWERS.noticePeriod;
  else if (
    label.includes('total exp') ||
    label.includes('overall exp') ||
    label.includes('years of exp')
  )
    value = MY_ANSWERS.experience;
  else if (label.includes('relevant exp')) value = MY_ANSWERS.relevantExperience;
  else if (label.includes('react')) value = MY_ANSWERS.reactExp;
  else if (label.includes('next')) value = MY_ANSWERS.nextExp;
  else if (label.includes('node')) value = MY_ANSWERS.nodeExp;
  else if (label.includes('javascript') || label.includes('js')) value = MY_ANSWERS.javascriptExp;
  else if (label.includes('typescript') || label.includes('ts')) value = MY_ANSWERS.typescriptExp;
  else if (label.includes('python')) value = MY_ANSWERS.pythonExp;
  else if (label.includes('sql') || label.includes('mysql') || label.includes('postgres'))
    value = MY_ANSWERS.sqlExp;
  else if (label.includes('mongo')) value = MY_ANSWERS.mongoExp;
  else if (label.includes('aws') || label.includes('cloud')) value = MY_ANSWERS.awsExp;
  else if (label.includes('docker') || label.includes('kubernetes') || label.includes('k8s'))
    value = MY_ANSWERS.dockerExp;
  else if (label.includes('git')) value = MY_ANSWERS.gitExp;
  else if (label.includes('experience') || label.includes('exp'))
    value = MY_ANSWERS.experience; // generic fallback
  else if (label.includes('location') || label.includes('city') || label.includes('preferred'))
    value = MY_ANSWERS.preferredLocation;
  else if (label.includes('current location')) value = MY_ANSWERS.currentLocation;
  else if (
    label.includes('qualification') ||
    label.includes('education') ||
    label.includes('degree')
  )
    value = MY_ANSWERS.qualification;
  else if (label.includes('passing year') || label.includes('graduation year'))
    value = MY_ANSWERS.passingYear;
  else if (label.includes('work mode') || label.includes('work from')) value = MY_ANSWERS.workMode;
  else if (label.includes('shift')) value = MY_ANSWERS.shiftPreference;
  else if (label.includes('company type')) value = MY_ANSWERS.companyType;
  else if (label.includes('team size')) value = MY_ANSWERS.teamSize;

  const options = await select.$$('option');

  if (value) {
    for (const option of options) {
      const text = (await option.textContent()).toLowerCase();
      const val = ((await option.getAttribute('value')) || '').toLowerCase();
      if (text.includes(value.toLowerCase()) || val.includes(value.toLowerCase())) {
        await select.selectOption({ label: (await option.textContent()).trim() });
        return;
      }
    }
  }

  if (options.length > 1) {
    const fallbackText = await options[1].textContent();
    await select.selectOption({ label: fallbackText.trim() });
    db.addLog({ level: 'warn', event: 'questionnaire', message: `  Select fallback (second option) for: "${label}"` });
  }
}

async function handleTextInput(input, label) {
  let value = '';

  if (label.includes('notice')) value = MY_ANSWERS.noticePeriod;
  else if (
    label.includes('total exp') ||
    label.includes('overall exp') ||
    label.includes('years of exp')
  )
    value = MY_ANSWERS.experience;
  else if (label.includes('relevant exp')) value = MY_ANSWERS.relevantExperience;
  else if (label.includes('react')) value = MY_ANSWERS.reactExp;
  else if (label.includes('next')) value = MY_ANSWERS.nextExp;
  else if (label.includes('node')) value = MY_ANSWERS.nodeExp;
  else if (label.includes('javascript') || label.includes('js')) value = MY_ANSWERS.javascriptExp;
  else if (label.includes('typescript') || label.includes('ts')) value = MY_ANSWERS.typescriptExp;
  else if (label.includes('python')) value = MY_ANSWERS.pythonExp;
  else if (label.includes('sql') || label.includes('mysql') || label.includes('postgres'))
    value = MY_ANSWERS.sqlExp;
  else if (label.includes('mongo')) value = MY_ANSWERS.mongoExp;
  else if (label.includes('aws') || label.includes('cloud')) value = MY_ANSWERS.awsExp;
  else if (label.includes('docker') || label.includes('kubernetes') || label.includes('k8s'))
    value = MY_ANSWERS.dockerExp;
  else if (label.includes('git')) value = MY_ANSWERS.gitExp;
  else if (label.includes('experience') || label.includes('exp'))
    value = MY_ANSWERS.experience; // generic fallback
  else if (
    label.includes('current ctc') ||
    label.includes('current salary') ||
    label.includes('ctc per annum')
  )
    value = MY_ANSWERS.currentCTC;
  else if (
    label.includes('expected ctc') ||
    label.includes('expected salary') ||
    label.includes('salary expectation')
  )
    value = MY_ANSWERS.expectedCTC;
  else if (label.includes('current location')) value = MY_ANSWERS.currentLocation;
  else if (label.includes('location') || label.includes('city') || label.includes('preferred'))
    value = MY_ANSWERS.preferredLocation;
  else if (label.includes('current company') || label.includes('employer'))
    value = MY_ANSWERS.currentCompany;
  else if (
    label.includes('designation') ||
    label.includes('current role') ||
    label.includes('job title')
  )
    value = MY_ANSWERS.currentDesignation;
  else if (label.includes('team size')) value = MY_ANSWERS.teamSize;
  else if (label.includes('passing year') || label.includes('graduation year'))
    value = MY_ANSWERS.passingYear;
  else if (label.includes('percentage') || label.includes('cgpa') || label.includes('marks'))
    value = MY_ANSWERS.percentage;

  if (value) {
    await input.fill(value);
  } else {
    db.addLog({ level: 'warn', event: 'questionnaire', message: `  No answer mapped for text field: "${label}"` });
  }
}

async function fillQuestionnaire(page) {
  try {
    await page.waitForSelector(SEL.questionnaireForm, { timeout: 5000 });
  } catch {
    return true; // No questionnaire, all good
  }

  const fields = await page.$$(SEL.formField);
  db.addLog({ level: 'info', event: 'questionnaire', message: `  Found ${fields.length} questionnaire fields` });

  for (const field of fields) {
    try {
      // Get the label text to understand what's being asked
      const labelEl = await field.$('label, [class*="label"], legend');
      const label = labelEl ? (await labelEl.textContent()).toLowerCase().trim() : '';

      db.addLog({ level: 'info', event: 'questionnaire', message: `  Handling field: "${label}"` });

      // --- Radio buttons ---
      const radios = await field.$$('input[type="radio"]');
      if (radios.length > 0) {
        await handleRadio(field, radios, label);
        continue;
      }

      // --- Select / Dropdown ---
      const select = await field.$('select');
      if (select) {
        await handleSelect(select, label);
        continue;
      }

      // --- Text / Number inputs ---
      const input = await field.$('input[type="text"], input[type="number"], input:not([type])');
      if (input) {
        await handleTextInput(input, label);
        continue;
      }
    } catch (e) {
      db.addLog({ level: 'warn', event: 'questionnaire', message: `  Field error: ${e.message}` });
    }
  }

  // Submit the questionnaire
  try {
    const submitBtn = await page.$(SEL.submitQuestionnaire);
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForTimeout(2000);
    }
  } catch (e) {
    db.addLog({ level: 'warn', event: 'questionnaire', message: `  Could not submit questionnaire: ${e.message}` });
  }

  return true;
}

module.exports = { fillQuestionnaire };
