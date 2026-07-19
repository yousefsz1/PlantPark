import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Missing Authorization header');
    const jwt = authHeader.replace(/^Bearer\s+/i, '');

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase service credentials not configured');

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Verify the caller's JWT and resolve their user id.
    const { data: userData, error: userErr } = await adminClient.auth.getUser(jwt);
    if (userErr || !userData?.user) throw new Error('Invalid or expired session');
    const userId = userData.user.id;

    // 1. Delete all files under this user's storage folder (plant-images/<userId>/...).
    //    Recursive + paginated: lawn progress photos live in nested folders
    //    (<userId>/progress/<plantId>/...) which a single flat .list() never
    //    saw, and a single call caps at its limit — both would silently leave
    //    orphaned photos behind after account deletion (GDPR risk).
    const PAGE = 1000;
    const deleteFolder = async (prefix: string): Promise<void> => {
      for (;;) {
        const { data: entries, error: listErr } = await adminClient.storage
          .from('plant-images')
          .list(prefix, { limit: PAGE });
        if (listErr) throw new Error(`Failed to list storage files: ${listErr.message}`);
        if (!entries || entries.length === 0) break;

        // Folders come back with id === null; recurse into them first.
        const folders = entries.filter((e) => e.id === null);
        const files = entries.filter((e) => e.id !== null);

        for (const folder of folders) {
          await deleteFolder(`${prefix}/${folder.name}`);
        }

        if (files.length > 0) {
          const paths = files.map((f) => `${prefix}/${f.name}`);
          const { error: removeErr } = await adminClient.storage.from('plant-images').remove(paths);
          if (removeErr) throw new Error(`Failed to delete storage files: ${removeErr.message}`);
        }

        if (entries.length < PAGE) break;
      }
    };
    await deleteFolder(userId);

    // 2. Delete the user from Auth — cascades to plants, care_tasks,
    // journal_entries, favourites, profiles, and plant_photos via ON DELETE CASCADE.
    const { error: deleteErr } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteErr) throw new Error(`Failed to delete user: ${deleteErr.message}`);

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});
