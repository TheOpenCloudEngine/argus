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
 * <h3>Impala version compatibility</h3>
 * <table>
 *   <tr><th>Version</th><th>Signature</th></tr>
 *   <tr><td>3.x (CDP 7.x)</td><td>{@code createExecRequest(TQueryCtx, StringBuilder)}</td></tr>
 *   <tr><td>4.0+ (ASF)</td><td>{@code createExecRequest(PlanCtx)}</td></tr>
 * </table>
 *
 * <p>In 4.x, {@code TQueryCtx} is wrapped inside {@code PlanCtx} and accessed
 * via {@code planCtx.getQueryContext()}. The transformer handles both signatures
 * by passing the first argument to {@link QueryInterceptor} which unwraps it
 * at runtime via reflection.</p>
 *
 * <p>Only the <b>public</b> overload is instrumented. The private overload
 * {@code createExecRequest(Planner, PlanCtx)} is skipped to avoid double-counting.</p>
 */
public class ImpalaQueryTransformer implements ClassFileTransformer {

    private static final String LOG_PREFIX = "[ImpalaQueryAgent] ";

    private static final String TARGET_CLASS = "org/apache/impala/service/Frontend";
    private static final String TARGET_METHOD = "createExecRequest";

    @Override
    public byte[] transform(ClassLoader loader, String className, Class<?> classBeingRedefined,
                            ProtectionDomain protectionDomain, byte[] classfileBuffer) {
        if (!TARGET_CLASS.equals(className)) {
            return null;
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
            return null;
        }
    }

    /**
     * ClassVisitor that instruments only the public createExecRequest overload.
     */
    private static class FrontendClassVisitor extends ClassVisitor {
        FrontendClassVisitor(ClassVisitor cv) {
            super(Opcodes.ASM9, cv);
        }

        @Override
        public MethodVisitor visitMethod(int access, String name, String descriptor,
                                         String signature, String[] exceptions) {
            MethodVisitor mv = super.visitMethod(access, name, descriptor, signature, exceptions);

            if (!TARGET_METHOD.equals(name)) {
                return mv;
            }

            // Only instrument the public overload (skip private createExecRequest(Planner, PlanCtx))
            if ((access & Opcodes.ACC_PUBLIC) == 0) {
                System.out.println(LOG_PREFIX + "Skipping non-public overload: " + name + descriptor);
                return mv;
            }

            System.out.println(LOG_PREFIX + "Instrumenting method: " + name + descriptor);
            return new CreateExecRequestAdvice(mv, access, name, descriptor);
        }
    }

    /**
     * AdviceAdapter that injects interceptor calls around {@code createExecRequest}.
     *
     * <p>The first argument is passed to {@link QueryInterceptor} as-is. The
     * interceptor uses reflection to detect whether it is a {@code TQueryCtx}
     * (3.x) or {@code PlanCtx} (4.x) and extracts data accordingly.</p>
     */
    private static class CreateExecRequestAdvice extends AdviceAdapter {

        private static final String INTERCEPTOR =
                "org/opencloudengine/argus/catalog/collector/impala/QueryInterceptor";

        private int firstArgLocal = -1;

        CreateExecRequestAdvice(MethodVisitor mv, int access, String name, String desc) {
            super(Opcodes.ASM9, mv, access, name, desc);
        }

        @Override
        protected void onMethodEnter() {
            // Store the first argument (TQueryCtx in 3.x, PlanCtx in 4.x)
            firstArgLocal = newLocal(Type.getType(Object.class));
            loadArg(0);
            storeLocal(firstArgLocal);

            // Call QueryInterceptor.onQueryStart(arg0)
            loadLocal(firstArgLocal);
            invokeStatic(
                    Type.getType("L" + INTERCEPTOR + ";"),
                    new Method("onQueryStart", "(Ljava/lang/Object;)V")
            );
        }

        @Override
        protected void onMethodExit(int opcode) {
            if (opcode == ARETURN) {
                // Return value (TExecRequest) is on top of stack
                dup();
                loadLocal(firstArgLocal);
                invokeStatic(
                        Type.getType("L" + INTERCEPTOR + ";"),
                        new Method("onQueryComplete", "(Ljava/lang/Object;Ljava/lang/Object;)V")
                );
            }
        }
    }
}
