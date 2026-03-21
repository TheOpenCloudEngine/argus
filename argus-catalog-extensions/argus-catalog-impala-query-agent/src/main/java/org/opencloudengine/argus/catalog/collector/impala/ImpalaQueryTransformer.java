package org.opencloudengine.argus.catalog.collector.impala;

import org.objectweb.asm.*;
import org.objectweb.asm.commons.AdviceAdapter;

import java.lang.instrument.ClassFileTransformer;
import java.security.ProtectionDomain;

/**
 * ASM-based ClassFileTransformer for Impala Frontend.
 *
 * <p>Instruments {@code org.apache.impala.service.Frontend#createExecRequest}
 * to capture query execution events including query text, plan, user, and
 * delegate user information.</p>
 *
 * <p>Target method signature (Impala 3.x / CDP 7.x):</p>
 * <pre>
 * public TExecRequest createExecRequest(TQueryCtx queryCtx, StringBuilder timeline)
 * </pre>
 *
 * <p>The transformer injects calls to {@link QueryInterceptor} at method entry
 * and exit to capture query details before and after execution.</p>
 */
public class ImpalaQueryTransformer implements ClassFileTransformer {

    private static final String LOG_PREFIX = "[ImpalaQueryAgent] ";

    /**
     * Target class to instrument (internal name format).
     */
    private static final String TARGET_CLASS = "org/apache/impala/service/Frontend";

    /**
     * Target method to intercept.
     */
    private static final String TARGET_METHOD = "createExecRequest";

    @Override
    public byte[] transform(ClassLoader loader, String className, Class<?> classBeingRedefined,
                            ProtectionDomain protectionDomain, byte[] classfileBuffer) {
        if (!TARGET_CLASS.equals(className)) {
            return null; // Return null = no transformation
        }

        System.out.println(LOG_PREFIX + "Transforming class: " + className);

        try {
            ClassReader cr = new ClassReader(classfileBuffer);
            ClassWriter cw = new ClassWriter(cr, ClassWriter.COMPUTE_FRAMES | ClassWriter.COMPUTE_MAXS);
            ClassVisitor cv = new FrontendClassVisitor(cw);
            cr.accept(cv, ClassReader.EXPAND_FRAMES);
            return cw.toByteArray();
        } catch (Exception e) {
            System.err.println(LOG_PREFIX + "ERROR transforming " + className + ": " + e.getMessage());
            e.printStackTrace();
            return null; // Fall back to original bytecode
        }
    }

    /**
     * ClassVisitor that finds the target method and applies the advice adapter.
     */
    private static class FrontendClassVisitor extends ClassVisitor {
        FrontendClassVisitor(ClassVisitor cv) {
            super(Opcodes.ASM9, cv);
        }

        @Override
        public MethodVisitor visitMethod(int access, String name, String descriptor,
                                         String signature, String[] exceptions) {
            MethodVisitor mv = super.visitMethod(access, name, descriptor, signature, exceptions);
            if (TARGET_METHOD.equals(name)) {
                System.out.println(LOG_PREFIX + "Instrumenting method: " + name + descriptor);
                return new CreateExecRequestAdvice(mv, access, name, descriptor);
            }
            return mv;
        }
    }

    /**
     * AdviceAdapter that injects interceptor calls around {@code createExecRequest}.
     *
     * <p>At method entry: captures TQueryCtx (first argument) to extract query text,
     * user, delegate user, and timestamp.</p>
     *
     * <p>At method exit: captures TExecRequest (return value) to extract query plan.</p>
     */
    private static class CreateExecRequestAdvice extends AdviceAdapter {

        private static final String INTERCEPTOR = "org/opencloudengine/argus/catalog/collector/impala/QueryInterceptor";

        private int queryCtxLocal = -1;

        CreateExecRequestAdvice(MethodVisitor mv, int access, String name, String desc) {
            super(Opcodes.ASM9, mv, access, name, desc);
        }

        @Override
        protected void onMethodEnter() {
            // Store the first argument (TQueryCtx) for later use
            // Method: createExecRequest(TQueryCtx queryCtx, StringBuilder timeline)
            // 'this' is arg0, queryCtx is arg1
            queryCtxLocal = newLocal(Type.getType(Object.class));
            loadArg(0); // queryCtx (first method argument)
            storeLocal(queryCtxLocal);

            // Call QueryInterceptor.onQueryStart(queryCtx)
            loadLocal(queryCtxLocal);
            invokeStatic(
                    Type.getType("L" + INTERCEPTOR + ";"),
                    new Method("onQueryStart", "(Ljava/lang/Object;)V")
            );
        }

        @Override
        protected void onMethodExit(int opcode) {
            if (opcode == RETURN || opcode == ARETURN) {
                // At normal return, the return value (TExecRequest) is on top of stack
                // We need to peek at it without consuming it
                if (opcode == ARETURN) {
                    dup(); // Duplicate return value
                    loadLocal(queryCtxLocal); // Push queryCtx
                    invokeStatic(
                            Type.getType("L" + INTERCEPTOR + ";"),
                            new Method("onQueryComplete", "(Ljava/lang/Object;Ljava/lang/Object;)V")
                    );
                }
            }
        }
    }
}
