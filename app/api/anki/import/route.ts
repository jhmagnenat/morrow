import {courseRoute} from '@/lib/courseScope';
import {importAnkiPackage,previewAnkiPackage} from '@/lib/ankiImport';
export const POST=courseRoute(async(request:Request)=>{
  try{
    const form=await request.formData(),file=form.get('file');
    if(!(file instanceof File))return Response.json({error:'An .apkg file is required'},{status:400});
    if(file.size>256*1024*1024)return Response.json({error:'Package exceeds 256 MiB'},{status:413});
    const bytes=Buffer.from(await file.arrayBuffer());
    return Response.json(form.get('preview')==='true'?previewAnkiPackage(bytes):importAnkiPackage(bytes,file.name,{progress:form.get('progress')==='true'}));
  }catch(error){return Response.json({error:error instanceof Error?error.message:'Anki import failed; current data preserved'},{status:400});}
});
