const fs = require('fs');
let code = fs.readFileSync('src/IncentivePlannerTab.tsx', 'utf8');

const helpers = `
  const t = (s: string) => s;
  const getProp = (obj: any, key: string | number) => obj ? Reflect.get(obj, key) : undefined;
`;
code = code.replace('const [dataEntryMode', helpers.trim() + '\n  const [dataEntryMode');

code = code.replace(/>Data Entry Method</g, `>{t('Data Entry Method')}<`);
code = code.replace(/>OEM SOB Data</g, `>{t('OEM SOB Data')}<`);
code = code.replace(/>Manual Entry</g, `>{t('Manual Entry')}<`);
code = code.replace(/>Achievement</g, `>{t('Achievement')}<`);
code = code.replace(/>Lifted: /g, `>{t('Lifted: ')}`);
code = code.replace(/>Total: /g, `>{t('Total: ')}`);
code = code.replace(/>Earnings</g, `>{t('Earnings')}<`);
code = code.replace(/>Earned: ₹/g, `>{t('Earned: ₹')}`);
code = code.replace(/>Potential: ₹/g, `>{t('Potential: ₹')}`);
code = code.replace(/>Auto Calculate Potential Earnings</g, `>{t('Auto Calculate Potential Earnings')}<`);
code = code.replace(/>No Data Available</g, `>{t('No Data Available')}<`);
code = code.replace(/>Actions</g, `>{t('Actions')}<`);
code = code.replace(/>incentive target</g, `>{t('incentive target')}<`);
code = code.replace(/>Save</g, `>{t('Save')}<`);
code = code.replace(/>Cancel</g, `>{t('Cancel')}<`);

code = code.replace(/incentiveEdits\[([^\]]+)\]/g, 'getProp(incentiveEdits, $1)');
code = code.replace(/incentiveRates\[([^\]]+)\]/g, 'getProp(incentiveRates, $1)');
code = code.replace(/row\[key\]/g, 'getProp(row, key)');
code = code.replace(/prev\?\.\[row\.id\]/g, 'getProp(prev, row.id)');
code = code.replace(/COLORS_ACH\[([^\]]+)\]/g, 'getProp(COLORS_ACH, $1)');
code = code.replace(/COLORS_EARN\[([^\]]+)\]/g, 'getProp(COLORS_EARN, $1)');
code = code.replace(/delete n\[id\];/g, 'Reflect.deleteProperty(n, id);');

fs.writeFileSync('src/IncentivePlannerTab.tsx', code);
console.log("Fixes applied successfully.");
