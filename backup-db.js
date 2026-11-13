import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function backup() {
  const { data, error } = await supabase.from('questions').select('*');
  if (error) {
    console.error('Backup failed:', error);
    process.exit(1);
  }
  const backupDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir);
  
  const filename = `backup-${new Date().toISOString().split('T')[0]}.json`;
  fs.writeFileSync(path.join(backupDir, filename), JSON.stringify(data, null, 2));
  console.log(`Backup saved to ${filename}`);
}
backup();